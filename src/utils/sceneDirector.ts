/**
 * Scene Director — a cheap, cached AI read of each passage that later drives
 * adaptive theming, soundscapes, and emotional TTS. See docs/SCENE_DIRECTOR.md.
 *
 * This module is the enrichment core: pure helpers (hashing, prompt building,
 * response parsing, batching) plus a thin orchestrator over the existing
 * OpenAI-compatible client. It only ANNOTATES — it never rewrites prose (that's
 * Lens's job). Nothing here touches the store or React; callers cache the
 * returned descriptors.
 */

import { CardInfo, Mood, SceneDescriptor, SceneEmphasis } from '../types';
import { cardToPromptBlock } from './cardContext';
import { ChatMsg, chatCompletion, SamplerParams } from './aiClient';

/** A passage handed to the Director for reading. */
export interface ScenePassage {
  messageId: string;
  /** Speaker/character name, for the speaker field. */
  name: string;
  content: string;
}

export const MOODS: readonly Mood[] = [
  'tense', 'tender', 'ominous', 'joyful', 'melancholy',
  'action', 'eerie', 'awe', 'neutral',
];

const TIMES = ['dawn', 'day', 'dusk', 'night', 'unknown'] as const;
const EMPHASIS_KINDS = ['whisper', 'shout', 'beat'] as const;
const FX_KINDS = ['smoke', 'fog', 'stars', 'sparkles', 'rain', 'embers', 'snow', 'petals'] as const;

/** Passages per enrichment request. Small enough to keep locality + valid JSON. */
export const SCENE_BATCH_SIZE = 10;
/** Trailing passages repeated into the next batch for tonal continuity. */
export const SCENE_BATCH_OVERLAP = 1;
/** Cap per-passage text sent for reading — moods don't need the whole essay. */
const PASSAGE_CHAR_CAP = 1600;

/**
 * Fast, stable content fingerprint (djb2). Only used to detect that a passage
 * changed since it was last read — not for security. Same text → same hash.
 */
export const hashContent = (text: string): string => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export const SCENE_SYSTEM_PROMPT = [
  'You are a scene director for an interactive story reader.',
  'For each numbered passage, read it and return a compact JSON descriptor of',
  'its cinematic qualities. You ANNOTATE only — never rewrite or summarize the',
  'prose. Return ONLY a JSON array, one object per passage, in order:',
  '',
  '[{',
  '  "i": <passage number>,',
  `  "mood": one of ${MOODS.join('|')},`,
  '  "tension": number 0..1,',
  '  "location": short phrase or null,',
  '  "timeOfDay": one of dawn|day|dusk|night|unknown,',
  '  "speaker": { "name": string, "emotion": short word } or null,',
  '  "emphasis": [ { "text": <verbatim substring of the passage>, "kind": whisper|shout|beat } ],',
  `  "fx": one of ${FX_KINDS.join('|')} or null`,
  '}]',
  '',
  'Rules: emphasis.text MUST be an exact substring copied from the passage.',
  'Keep emphasis to at most 3 spans per passage. Set fx ONLY when the prose',
  'clearly shows that weather or particle effect on screen (mist rolling in,',
  'snowfall, sparks, floating ash, cherry blossoms…) — otherwise null.',
  'Output nothing but the JSON array.',
].join('\n');

/** Build the [system, user] messages that read a batch of passages. */
export const buildEnrichMessages = (
  passages: ScenePassage[],
  card?: CardInfo,
): ChatMsg[] => {
  const cardBlock = cardToPromptBlock(card);
  const body = passages
    .map((p, i) => {
      const text = p.content.length > PASSAGE_CHAR_CAP
        ? `${p.content.slice(0, PASSAGE_CHAR_CAP).trimEnd()}…`
        : p.content;
      return `#${i + 1} — ${p.name}\n${text}`;
    })
    .join('\n\n');

  // Grounding first, passages in the middle, the task restated last —
  // the app's U-shaped placement rule (see docs/SCENE_DIRECTOR.md §4).
  const user = [
    cardBlock && `STORY CONTEXT (for grounding only):\n${cardBlock}`,
    `PASSAGES:\n${body}`,
    'Return the JSON array of descriptors, one per passage, in order.',
  ].filter(Boolean).join('\n\n');

  return [
    { role: 'system', content: SCENE_SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
};

const clamp01 = (n: unknown): number => {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
};

const asMood = (m: unknown): Mood =>
  (typeof m === 'string' && (MOODS as readonly string[]).includes(m)) ? (m as Mood) : 'neutral';

const asTime = (t: unknown): SceneDescriptor['timeOfDay'] =>
  (typeof t === 'string' && (TIMES as readonly string[]).includes(t))
    ? (t as SceneDescriptor['timeOfDay']) : undefined;

/** Keep only emphasis spans that are genuine substrings of the passage. */
const cleanEmphasis = (raw: unknown, passageText: string): SceneEmphasis[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const out: SceneEmphasis[] = [];
  for (const e of raw) {
    const text = typeof e?.text === 'string' ? e.text.trim() : '';
    const kind = e?.kind;
    if (!text || !(EMPHASIS_KINDS as readonly string[]).includes(kind)) continue;
    if (!passageText.includes(text)) continue; // verbatim only — locate by indexOf later
    out.push({ text, kind });
    if (out.length >= 3) break;
  }
  return out.length ? out : undefined;
};

/** Pull the first JSON array out of a model reply (tolerant of prose/fences). */
const extractJsonArray = (raw: string): unknown[] | null => {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Parse a model reply into validated descriptors, matched back to their
 * passages by 1-based index `i` (falling back to array order). Malformed or
 * unmatched entries are dropped — never throws — so one bad passage can't sink
 * the batch.
 */
export const parseDescriptors = (
  raw: string,
  passages: ScenePassage[],
  now = Date.now(),
): SceneDescriptor[] => {
  const arr = extractJsonArray(raw);
  if (!arr) return [];
  const out: SceneDescriptor[] = [];
  arr.forEach((item, order) => {
    if (!item || typeof item !== 'object') return;
    const rec = item as Record<string, unknown>;
    const idx = Number.isFinite(rec.i as number) ? (rec.i as number) - 1 : order;
    const passage = passages[idx];
    if (!passage) return;
    const speakerRaw = rec.speaker as Record<string, unknown> | null | undefined;
    const speaker = speakerRaw && typeof speakerRaw.name === 'string' && speakerRaw.name.trim()
      ? { name: speakerRaw.name.trim(), emotion: String(speakerRaw.emotion ?? '').trim() || 'neutral' }
      : undefined;
    out.push({
      messageId: passage.messageId,
      hash: hashContent(passage.content),
      mood: asMood(rec.mood),
      tension: clamp01(rec.tension),
      location: typeof rec.location === 'string' && rec.location.trim() ? rec.location.trim() : undefined,
      timeOfDay: asTime(rec.timeOfDay),
      speaker,
      emphasis: cleanEmphasis(rec.emphasis, passage.content),
      fx: typeof rec.fx === 'string' && (FX_KINDS as readonly string[]).includes(rec.fx)
        ? (rec.fx as SceneDescriptor['fx'])
        : undefined,
      createdAt: now,
    });
  });
  return out;
};

/** Split passages into overlapping batches for enrichment. */
export const batchPassages = (
  passages: ScenePassage[],
  size = SCENE_BATCH_SIZE,
  overlap = SCENE_BATCH_OVERLAP,
): ScenePassage[][] => {
  if (passages.length === 0) return [];
  const step = Math.max(1, size - overlap);
  const batches: ScenePassage[][] = [];
  for (let i = 0; i < passages.length; i += step) {
    batches.push(passages.slice(i, i + size));
    if (i + size >= passages.length) break;
  }
  return batches;
};

export interface EnrichConfig {
  base: string;
  key: string;
  model: string;
  card?: CardInfo;
  params?: SamplerParams;
}

export interface EnrichOptions {
  signal?: AbortSignal;
  /**
   * Called after each batch with that batch's descriptors plus running counts
   * (`done` = unique passages read so far, `total` = passages requested). Lets
   * the caller persist + show progress incrementally rather than all at once.
   */
  onBatch?: (descriptors: SceneDescriptor[], done: number, total: number) => void;
}

/**
 * Read a set of passages and return their descriptors. Batches internally with
 * a 1-passage overlap for continuity; the overlap means a passage may be read
 * twice, so results de-dupe by `messageId` (last write wins). Never throws on a
 * bad batch — it logs and skips so a long run always makes progress.
 */
export const enrichPassages = async (
  passages: ScenePassage[],
  cfg: EnrichConfig,
  opts: EnrichOptions = {},
): Promise<SceneDescriptor[]> => {
  const { signal, onBatch } = opts;
  const byId = new Map<string, SceneDescriptor>();
  for (const batch of batchPassages(passages)) {
    if (signal?.aborted) break;
    try {
      const reply = await chatCompletion(
        cfg.base, cfg.key, cfg.model,
        buildEnrichMessages(batch, cfg.card),
        { temperature: 0.2, max_tokens: 1200, ...cfg.params },
        signal,
      );
      const descriptors = parseDescriptors(reply, batch);
      for (const d of descriptors) byId.set(d.messageId, d);
      onBatch?.(descriptors, byId.size, passages.length);
    } catch (e) {
      if (signal?.aborted) break;
      console.error('[SceneDirector] batch failed', e);
    }
  }
  return [...byId.values()];
};

/** True when a cached descriptor no longer matches the passage's text. */
export const isStale = (descriptor: SceneDescriptor | undefined, content: string): boolean =>
  !descriptor || descriptor.hash !== hashContent(content);

/** Passages that are missing from the cache or whose text has changed. */
export const selectStale = (
  passages: ScenePassage[],
  cache: Record<string, SceneDescriptor> | undefined,
): ScenePassage[] => passages.filter(p => isStale(cache?.[p.messageId], p.content));
