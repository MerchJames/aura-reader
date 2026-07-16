/**
 * Agentic summarizer — a map-reduce over a (possibly huge) story that no single
 * context could hold. It chunks the transcript to fit a worker's context
 * window (~80% by default), summarizes each chunk to a chosen format ("map"),
 * then folds the section summaries into one coherent doc ("reduce"). The result
 * becomes a versioned Lens Pin.
 *
 * Single-LLM by design: the `send` callback runs one request at a time, so the
 * whole thing is a sequential queue on the user's one model. The core here is
 * pure/injectable (pass any `send`) — orchestration + store wiring live in the
 * panel that calls `runSummary`.
 */

import { CardInfo } from '../types';
import { cardToPromptBlock } from './cardContext';
import { ChatMsg } from './aiClient';

export interface SummaryPassage {
  name: string;
  content: string;
}

/** Rough chars-per-token for budgeting (English prose ≈ 4). */
export const CHARS_PER_TOKEN = 4;
/** Fallback context window when the user hasn't set one. */
export const DEFAULT_CONTEXT_TOKENS = 8000;

/**
 * Char budget for one chunk: a fraction (default 80%) of the context window,
 * minus a reserve for the system prompt, format instruction, and reply.
 */
export const estimateBudgetChars = (
  contextTokens: number,
  ratio = 0.8,
  reserveChars = 1500,
): number => {
  const tokens = contextTokens > 0 ? contextTokens : DEFAULT_CONTEXT_TOKENS;
  return Math.max(600, Math.round(tokens * CHARS_PER_TOKEN * ratio) - reserveChars);
};

/**
 * Split passages into contiguous chunks that each fit `budgetChars`. A single
 * passage larger than the budget becomes its own (over-budget) chunk rather
 * than being dropped — the model still summarizes it, just with less headroom.
 */
export const chunkByBudget = (
  passages: SummaryPassage[],
  budgetChars: number,
): SummaryPassage[][] => {
  const budget = Math.max(500, budgetChars);
  const chunks: SummaryPassage[][] = [];
  let cur: SummaryPassage[] = [];
  let size = 0;
  for (const p of passages) {
    const len = p.name.length + p.content.length + 2;
    if (cur.length > 0 && size + len > budget) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(p);
    size += len;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
};

export interface SummaryFormat {
  id: string;
  name: string;
  instruction: string;
}

export const SUMMARY_FORMATS: SummaryFormat[] = [
  { id: 'recap', name: 'Bulleted recap', instruction: 'Write a concise bulleted recap of the key events, decisions, and revelations.' },
  { id: 'synopsis', name: 'Prose synopsis', instruction: 'Write a flowing prose synopsis of the story so far.' },
  { id: 'timeline', name: 'Timeline', instruction: 'Write a chronological timeline of the notable beats, each a short ordered entry.' },
  { id: 'characters', name: 'Character digest', instruction: 'Summarize per character: their arc, key relationships, and current state.' },
];

const passageText = (chunk: SummaryPassage[]): string =>
  chunk.map(p => (p.name ? `${p.name}: ${p.content}` : p.content)).join('\n\n');

/** Messages for the "map" step: summarize one chunk in isolation but in order. */
export const buildMapMessages = (
  chunk: SummaryPassage[],
  instruction: string,
  priorSummary: string,
  card: CardInfo | undefined,
  index: number,
  count: number,
): ChatMsg[] => {
  const system = [
    `You are summarizing part ${index} of ${count} of a longer story for a reader's reference note.`,
    'Be faithful: summarize only what is present in this section. Do not invent, and do not repeat the summary-so-far.',
    instruction,
  ].join('\n');

  const user = [
    cardToPromptBlock(card) && `STORY CONTEXT (for grounding only):\n${cardToPromptBlock(card)}`,
    priorSummary && `SUMMARY SO FAR (for continuity, do not restate):\n${priorSummary}`,
    `SECTION ${index}/${count}:\n${passageText(chunk)}`,
    'Summarize THIS section only, consistent with the summary so far.',
  ].filter(Boolean).join('\n\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
};

/** Messages for the "reduce" step: fold several section summaries into one. */
export const buildReduceMessages = (
  partials: string[],
  instruction: string,
  card: CardInfo | undefined,
): ChatMsg[] => {
  const system = [
    'You are combining section summaries of one story into a single coherent reference note.',
    'Remove redundancy, keep chronological/logical order, and invent nothing not present in the sections.',
    instruction,
  ].join('\n');

  const sections = partials.map((p, i) => `### Section ${i + 1}\n${p}`).join('\n\n');
  const user = [
    cardToPromptBlock(card) && `STORY CONTEXT (for grounding only):\n${cardToPromptBlock(card)}`,
    `SECTION SUMMARIES:\n${sections}`,
    'Produce the final combined summary.',
  ].filter(Boolean).join('\n\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
};

export type SummaryPhase = 'mapping' | 'reducing';

export interface RunSummaryOptions {
  passages: SummaryPassage[];
  budgetChars: number;
  instruction: string;
  card?: CardInfo;
  /** One model call. Injected so the core is testable + transport-agnostic. */
  send: (messages: ChatMsg[], signal?: AbortSignal) => Promise<string>;
  signal?: AbortSignal;
  onPhase?: (phase: SummaryPhase, done: number, total: number) => void;
}

/** Trailing chars of the running summary carried into the next map call. */
const CONTINUITY_CHARS = 1200;

/**
 * Run the full map-reduce. Sequential (one `send` at a time) so a single model
 * acts as the whole worker pool. Aborting returns whatever was combined so far.
 * Returns the final combined document (markdown).
 */
export const runSummary = async (opts: RunSummaryOptions): Promise<string> => {
  const chunks = chunkByBudget(opts.passages, opts.budgetChars);
  if (chunks.length === 0) return '';

  // Map: summarize each chunk, carrying a little continuity forward.
  const partials: string[] = [];
  let prior = '';
  for (let i = 0; i < chunks.length; i++) {
    if (opts.signal?.aborted) break;
    opts.onPhase?.('mapping', i, chunks.length);
    const msgs = buildMapMessages(chunks[i], opts.instruction, prior, opts.card, i + 1, chunks.length);
    const part = (await opts.send(msgs, opts.signal)).trim();
    if (part) {
      partials.push(part);
      prior = part.length > CONTINUITY_CHARS ? part.slice(-CONTINUITY_CHARS) : part;
    }
  }
  opts.onPhase?.('mapping', chunks.length, chunks.length);

  if (partials.length === 0) return '';
  if (partials.length === 1) return partials[0];

  // Reduce: fold the partials, grouping to fit the budget; repeat until one.
  opts.onPhase?.('reducing', 0, 1);
  let current = partials;
  while (current.length > 1) {
    if (opts.signal?.aborted) break;
    const groups = chunkByBudget(current.map(c => ({ name: '', content: c })), opts.budgetChars);
    // Each partial already exceeds the budget on its own — can't fold further.
    if (groups.length >= current.length) break;
    const next: string[] = [];
    for (const g of groups) {
      if (opts.signal?.aborted) break;
      const msgs = buildReduceMessages(g.map(x => x.content), opts.instruction, opts.card);
      const combined = (await opts.send(msgs, opts.signal)).trim();
      next.push(combined || g.map(x => x.content).join('\n\n'));
    }
    current = next;
  }
  opts.onPhase?.('reducing', 1, 1);
  return current.length === 1 ? current[0] : current.join('\n\n');
};

/* ---------------------------------------------------------------- */
/* Sheet mode — same map-reduce, but each chunk yields table rows    */
/* that accumulate (deduped) into a structured sheet.                */
/* ---------------------------------------------------------------- */

/** Cap on rows collected into one sheet. */
export const MAX_SHEET_ROWS = 200;

/** Pull the first JSON array out of a reply (tolerant of prose/fences). */
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

/** Messages asking the model to extract table rows from one chunk. */
export const buildSheetMapMessages = (
  chunk: SummaryPassage[],
  columns: string[],
  instruction: string,
  card: CardInfo | undefined,
  index: number,
  count: number,
): ChatMsg[] => {
  const cols = columns.join(', ');
  const system = [
    `You are filling a table (columns: ${cols}) from part ${index} of ${count} of a story.`,
    `Return ONLY a JSON array of row objects, each with exactly these keys: ${cols}.`,
    'Include only rows supported by THIS section; invent nothing. Use "" for unknown cells.',
    instruction,
  ].join('\n');

  const user = [
    cardToPromptBlock(card) && `STORY CONTEXT (for grounding only):\n${cardToPromptBlock(card)}`,
    `SECTION ${index}/${count}:\n${passageText(chunk)}`,
    'Return the JSON array of rows for THIS section.',
  ].filter(Boolean).join('\n\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
};

/** Parse a reply into rows keyed by exactly `columns` (skips empty rows). */
export const parseRows = (raw: string, columns: string[]): Record<string, string>[] => {
  const arr = extractJsonArray(raw);
  if (!arr) return [];
  const rows: Record<string, string>[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const row: Record<string, string> = {};
    let any = false;
    for (const col of columns) {
      const v = rec[col];
      row[col] = v == null ? '' : String(v).trim();
      if (row[col]) any = true;
    }
    if (any) rows.push(row);
  }
  return rows;
};

export interface RunSheetOptions {
  passages: SummaryPassage[];
  budgetChars: number;
  columns: string[];
  instruction: string;
  card?: CardInfo;
  send: (messages: ChatMsg[], signal?: AbortSignal) => Promise<string>;
  signal?: AbortSignal;
  onPhase?: (phase: SummaryPhase, done: number, total: number) => void;
}

/**
 * Fill a sheet by mapping each chunk to rows and accumulating them, deduped by
 * the first column (case-insensitive). Sequential single-model queue; aborting
 * keeps the rows gathered so far.
 */
export const runSheetFill = async (opts: RunSheetOptions): Promise<Record<string, string>[]> => {
  const columns = opts.columns.map(c => c.trim()).filter(Boolean);
  if (columns.length === 0) return [];
  const chunks = chunkByBudget(opts.passages, opts.budgetChars);
  const keyCol = columns[0];
  const rows: Record<string, string>[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    if (opts.signal?.aborted) break;
    opts.onPhase?.('mapping', i, chunks.length);
    const msgs = buildSheetMapMessages(chunks[i], columns, opts.instruction, opts.card, i + 1, chunks.length);
    let reply = '';
    try {
      reply = await opts.send(msgs, opts.signal);
    } catch (e) {
      if (opts.signal?.aborted) break;
      console.error('[Summarizer] sheet chunk failed', e);
      continue;
    }
    for (const row of parseRows(reply, columns)) {
      const key = (row[keyCol] ?? '').toLowerCase();
      if (!key || seen.has(key)) continue; // dedupe by first column
      seen.add(key);
      rows.push(row);
      if (rows.length >= MAX_SHEET_ROWS) break;
    }
    if (rows.length >= MAX_SHEET_ROWS) break;
  }
  opts.onPhase?.('mapping', chunks.length, chunks.length);
  return rows;
};
