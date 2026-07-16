import { Chain, ContextZone, Message } from '../types';

/** A message paired with its 1-based flat reading index (the number shown in the builder). */
export interface FlatEntry {
  msg: Message;
  index: number;
}

/** Flatten chains into reading order, numbering each message from 1. */
export const flatWithIndex = (chains: Chain[]): FlatEntry[] => {
  const out: FlatEntry[] = [];
  let i = 0;
  chains.forEach(c => c.messages.forEach(m => { out.push({ msg: m, index: ++i }); }));
  return out;
};

/** Collapse a set of reading indices into a compact label like "6–10, 14". */
export const groupRanges = (nums: number[]): string => {
  if (nums.length === 0) return '';
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let k = 1; k < sorted.length; k++) {
    if (sorted[k] === prev + 1) { prev = sorted[k]; continue; }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = prev = sorted[k];
  }
  parts.push(start === prev ? `${start}` : `${start}–${prev}`);
  return parts.join(', ');
};

/**
 * Parse a free-form range spec (the inverse of {@link groupRanges}) into the set
 * of 1-based reading indices it names. Accepts comma/space-separated singles and
 * ranges with any dash — e.g. "1-30", "1–30, 45, 50-60", "3 7 9". Reversed
 * ranges ("30-1") are normalized; non-numeric junk is ignored. `max` clamps the
 * upper bound so an open "1-99999" can't balloon. Returns sorted, deduped.
 */
export const parseRangeSpec = (spec: string, max?: number): number[] => {
  const out = new Set<number>();
  const cap = max && max > 0 ? max : Infinity;
  for (const token of spec.split(/[,\s]+/)) {
    const part = token.trim();
    if (!part) continue;
    const m = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (m) {
      let lo = parseInt(m[1], 10);
      let hi = parseInt(m[2], 10);
      if (lo > hi) [lo, hi] = [hi, lo];
      for (let n = Math.max(1, lo); n <= Math.min(hi, cap); n++) out.add(n);
      continue;
    }
    const single = part.match(/^(\d+)$/);
    if (single) {
      const n = parseInt(single[1], 10);
      if (n >= 1 && n <= cap) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
};

/** Resolve a message's live content (so the currently-streaming line reads true). */
export type TextResolver = (m: Message) => string;

export interface ZoneBuild {
  /** Formatted, prompt-ready body — empty string when the zone selects nothing live. */
  body: string;
  /** How many message-content lines the excerpt holds. */
  messageCount: number;
  /** How many messages contributed their full branchlines. */
  branchlineCount: number;
  empty: boolean;
}

/**
 * Render a Context Zone into a prompt block. Structure follows long-context
 * "lost in the middle" guidance: a short index up top, clearly delimited
 * sections, and the branchlines (usually the reader's optimization focus)
 * placed last so they sit in the high-attention tail — the user's actual
 * question still follows this block as the final turn.
 */
export const buildZoneBody = (
  zone: ContextZone, chains: Chain[], text: TextResolver,
): ZoneBuild => {
  const flat = flatWithIndex(chains);
  const included = flat.filter(f => zone.messageIds.includes(f.msg.id));
  // Only messages that genuinely have alternates contribute branchlines.
  const branchEntries = flat.filter(
    f => zone.branchlineIds.includes(f.msg.id) && (f.msg.swipes?.length ?? 0) > 1,
  );

  const indexLines: string[] = [];
  const sections: string[] = [];

  if (included.length) {
    const label = `messages ${groupRanges(included.map(f => f.index))}`;
    indexLines.push(`  [Excerpt] ${label} (${included.length} message${included.length === 1 ? '' : 's'})`);
    const bodyLines = included.map(f => `#${f.index} ${f.msg.name}: ${text(f.msg)}`);
    sections.push(`=== EXCERPT: ${label} ===\n${bodyLines.join('\n\n')}`);
  }

  branchEntries.forEach(f => {
    const versions = f.msg.swipes!;
    indexLines.push(`  [Branchlines #${f.index}] all ${versions.length} alternate versions of message #${f.index} (${f.msg.name})`);
    const vlines = versions.map((v, vi) => `Version ${vi + 1}:\n${v}`);
    sections.push(`=== BRANCHLINES of message #${f.index} (${f.msg.name}, ${versions.length} versions) ===\n${vlines.join('\n\n')}`);
  });

  const empty = included.length === 0 && branchEntries.length === 0;
  const header = [
    `--- CONTEXT ZONE: "${zone.name}" ---`,
    'A reader-curated selection of the story. Index of what follows:',
    ...indexLines,
  ].join('\n');

  return {
    body: empty ? '' : [header, '', ...sections].join('\n\n'),
    messageCount: included.length,
    branchlineCount: branchEntries.length,
    empty,
  };
};

/** One-line human summary of a zone for dropdowns/labels. */
export const zoneSummary = (zone: ContextZone, chains: Chain[]): string => {
  const flat = flatWithIndex(chains);
  const idx = flat.filter(f => zone.messageIds.includes(f.msg.id)).map(f => f.index);
  const branch = flat
    .filter(f => zone.branchlineIds.includes(f.msg.id) && (f.msg.swipes?.length ?? 0) > 1)
    .map(f => f.index);
  const parts: string[] = [];
  if (idx.length) parts.push(`msg ${groupRanges(idx)}`);
  if (branch.length) parts.push(`branchlines ${groupRanges(branch)}`);
  return parts.join(' · ') || 'empty';
};
