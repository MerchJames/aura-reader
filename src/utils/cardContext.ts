import { CardInfo, Pin, Sheet } from '../types';

const clamp = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;

/**
 * Compact, prompt-ready block of the attached character card — author-
 * written ground truth the AI can lean on for summaries, recaps, and
 * codex refinement. Kept tight (a few KB max) so it never crowds out
 * the actual story text.
 */
export const cardToPromptBlock = (card: CardInfo | undefined): string => {
  if (!card) return '';
  const lines: string[] = [];
  if (card.name) lines.push(`Name: ${card.name}`);
  if (card.description) lines.push(`Description: ${clamp(card.description, 1200)}`);
  if (card.personality) lines.push(`Personality: ${clamp(card.personality, 600)}`);
  if (card.scenario) lines.push(`Scenario: ${clamp(card.scenario, 600)}`);
  if (card.tags?.length) lines.push(`Tags: ${card.tags.join(', ')}`);
  if (card.creatorNotes) lines.push(`Creator notes: ${clamp(card.creatorNotes, 400)}`);
  for (const entry of (card.lorebook ?? []).slice(0, 30)) {
    const label = entry.title || entry.keys[0] || 'entry';
    lines.push(`Lore — ${label}: ${clamp(entry.content, 400)}`);
  }
  if (lines.length === 0) return '';
  return [
    '--- CHARACTER CARD (author-written ground truth) ---',
    ...lines,
  ].join('\n');
};

/**
 * Compact, prompt-ready block of the reader's tracking sheets, shared by
 * the assistant, scoped threads, and recaps. Clamped so a sprawling sheet
 * never crowds out the story text.
 */
export const sheetsToPromptBlock = (sheets: Sheet[] | undefined): string => {
  if (!sheets?.length) return '';
  const blocks = sheets.slice(0, 6).map(sh => {
    const cols = sh.columns.length ? sh.columns : ['Name', 'Note'];
    const rows = sh.rows.slice(0, 60).map(r =>
      cols.map(c => `${c}: ${r[c] ?? ''}`).join(' | '));
    return `## ${clamp(sh.title, 80)}\n${rows.join('\n')}`;
  });
  return ["--- READER'S TRACKING SHEETS ---", ...blocks].join('\n');
};

/**
 * Pinned visuals the reader flagged for AI context (charts, stat tables,
 * HTML the AI wrote earlier, big summary docs) — only pins explicitly marked
 * `inContext`. Unlike the story text, these are opt-in, so they're sent in
 * full: a large pinned summary comes through whole. A generous total budget
 * (~50k tokens) shared across pins is the only guard against a pathological
 * request; earlier pins get first claim on it.
 */
const PINS_BLOCK_BUDGET = 200_000;

export const pinsToPromptBlock = (pins: Pin[] | undefined): string => {
  const included = (pins ?? []).filter(p => p.inContext).slice(0, 6);
  if (!included.length) return '';
  let budget = PINS_BLOCK_BUDGET;
  const parts: string[] = [];
  for (const p of included) {
    if (budget <= 0) break;
    const body = clamp(p.content, budget);
    budget -= body.length;
    parts.push(`## ${clamp(p.title, 80)}\n${body}`);
  }
  return [
    "--- READER'S PINNED VISUALS (curated reference) ---",
    ...parts,
  ].join('\n');
};
