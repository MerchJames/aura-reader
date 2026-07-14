import { CardInfo, Chain, CowriteCandidate, CowriteKind, CowritePreset, CowriteRunSpec, Message } from '../types';
import { cardToPromptBlock } from './cardContext';
import { FlatEntry, flatWithIndex } from './contextZone';

/**
 * Cowriting presets: reusable recipes for the workflows readers repeat while
 * drafting with the AI — rank the alternate takes of a beat, fuse the best of
 * them, or check them against an earlier passage.
 *
 * The payoff is placement. buildCowritePayload assembles the request to match
 * "lost in the middle": stable scaffolding + the character card open the
 * system block, the REFERENCE (grounding) sits in its body, and the CANDIDATE
 * branches ride the high-attention tail inside the final user turn, with the
 * instruction as the literal last line. That keeps the material the model must
 * weigh, and the ask itself, in the two positions attention favors.
 */

/** Built-in recipes covering the common draft-time asks. Ship in code; readers
 *  duplicate one to make an editable custom preset. */
export const BUILTIN_COWRITE_PRESETS: CowritePreset[] = [
  {
    id: 'builtin-rank',
    name: 'Which branch is best?',
    builtIn: true,
    kind: 'compare',
    referenceLastN: 3,
    useAnchor: false,
    instruction: 'Compare these alternate versions of the same beat. Which reads best, and why? Rank them briefly, weighing voice, pacing, and continuity with the reference above.',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-blend',
    name: 'Blend the branches',
    builtIn: true,
    kind: 'blend',
    referenceLastN: 3,
    useAnchor: false,
    instruction: 'Write a single new version that combines the strongest parts of each alternate version, keeping the character voice and staying continuous with the reference above. Output only the rewritten passage — no preamble or commentary.',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-consistent',
    name: 'Consistent with earlier?',
    builtIn: true,
    kind: 'compare',
    referenceLastN: 3,
    useAnchor: true,
    instruction: 'Check each version against the anchored earlier passage(s) for continuity and consistency. Call out any contradictions, then say which version best fits what came before.',
    createdAt: 0,
    updatedAt: 0,
  },
];

/** A blank custom preset for the editor (id/timestamps filled by the store). */
export const blankCowritePreset = (): Omit<CowritePreset, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: 'My preset',
  kind: 'compare',
  referenceLastN: 3,
  useAnchor: false,
  instruction: 'Compare these versions and tell me which works best, and why.',
});

export type TextResolver = (m: Message) => string;

/** The version strings of a message: its swipes, or a single-element [content]. */
export const messageVersions = (m: Message): string[] =>
  (m.swipes && m.swipes.length > 1) ? m.swipes : [m.content];

/** Runtime picks the reader makes for a single run (not stored on the preset). */
export interface CowriteRuntime {
  referenceLastN: number;
  anchorIds: string[];
  candidates: CowriteCandidate[];
  instruction: string;
}

/**
 * Freeze a preset + the reader's runtime picks into a position-locked spec.
 * referenceIds = the N messages immediately before the current one, plus any
 * anchors, de-duped and ordered by reading position.
 */
export const resolveCowriteSpec = (
  preset: CowritePreset,
  chains: Chain[],
  currentId: string | undefined,
  runtime: CowriteRuntime,
): CowriteRunSpec => {
  const flat = flatWithIndex(chains);
  const curPos = flat.findIndex(f => f.msg.id === currentId); // 0-based; -1 if unknown
  const windowIds: string[] = [];
  if (runtime.referenceLastN > 0 && curPos > 0) {
    const start = Math.max(0, curPos - runtime.referenceLastN);
    for (let i = start; i < curPos; i++) windowIds.push(flat[i].msg.id);
  }
  const refSet = new Set<string>([...runtime.anchorIds, ...windowIds]);
  const referenceIds = flat.filter(f => refSet.has(f.msg.id)).map(f => f.msg.id);
  return {
    presetName: preset.name,
    kind: preset.kind,
    referenceIds,
    candidates: runtime.candidates.filter(c => c.messageId),
    instruction: (runtime.instruction.trim() || preset.instruction),
  };
};

const KIND_VERB: Record<CowriteKind, string> = {
  compare: 'compare',
  blend: 'blend into one',
  freeform: 'work from',
};

export interface CowritePayload {
  /** System block: scaffolding + card + reference grounding. */
  system: string;
  /** Final user turn: candidate branches (tail) then the instruction (last line). */
  userMessage: string;
  referenceCount: number;
  candidateCount: number;
  /** True when no candidate versions resolved — the caller should refuse to send. */
  empty: boolean;
}

type StoryLike = { title?: string; characterName?: string; userName?: string; card?: CardInfo };

/**
 * Assemble the two-part payload from a resolved spec. `resolve` returns a
 * message's live (Lens-aware) content so reference text tracks the reader's
 * edits; candidate versions are pulled verbatim from the message's swipes.
 */
export const buildCowritePayload = (
  spec: CowriteRunSpec,
  chains: Chain[],
  resolve: TextResolver,
  story?: StoryLike,
): CowritePayload => {
  const flat = flatWithIndex(chains);
  const byId = new Map<string, FlatEntry>(flat.map(f => [f.msg.id, f]));

  // --- Reference block → system (grounding only) ---
  const refEntries = spec.referenceIds
    .map(id => byId.get(id))
    .filter((e): e is FlatEntry => !!e);
  const refBlock = refEntries.length
    ? [
        '--- REFERENCE (earlier context — background only, do not rewrite) ---',
        ...refEntries.map(e => `#${e.index} ${e.msg.name}: ${resolve(e.msg)}`),
      ].join('\n\n')
    : '';

  // --- Candidate block → final user turn (high-attention tail) ---
  const candLines: string[] = [];
  let candidateCount = 0;
  for (const c of spec.candidates) {
    const entry = byId.get(c.messageId);
    if (!entry) continue;
    const all = messageVersions(entry.msg);
    const picks = c.versions.length
      ? c.versions.filter(i => i >= 0 && i < all.length)
      : all.map((_, i) => i);
    for (const vi of picks) {
      candidateCount++;
      const take = all.length > 1 ? `, take ${vi + 1}` : '';
      candLines.push(`### Version ${candidateCount} — message #${entry.index} (${entry.msg.name})${take}\n${all[vi]}`);
    }
  }

  const card = cardToPromptBlock(story?.card);
  const system = [
    `You are a cowriting partner for the story "${story?.title ?? 'Untitled'}".`,
    story?.characterName ? `Main character: ${story.characterName}.` : '',
    story?.userName ? `The reader writes as "${story.userName}".` : '',
    "The reader is choosing between (or fusing) alternate versions of a single beat. Use the REFERENCE below purely as grounding — never rewrite or repeat it. The candidate versions and the instruction are in the reader's message that follows. Reply in markdown.",
    card ? `\n${card}` : '',
    refBlock ? `\n${refBlock}` : '',
  ].filter(Boolean).join('\n');

  const verb = KIND_VERB[spec.kind];
  const header = candidateCount === 0
    ? '(No candidate versions were provided.)'
    : `Here ${candidateCount === 1 ? 'is 1 version' : `are ${candidateCount} versions`} to ${verb}:`;
  const userMessage = [
    header,
    '',
    candLines.join('\n\n'),
    '',
    '---',
    `INSTRUCTION: ${spec.instruction}`,
  ].join('\n');

  return {
    system,
    userMessage,
    referenceCount: refEntries.length,
    candidateCount,
    empty: candidateCount === 0,
  };
};
