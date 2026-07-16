/**
 * Pin update — have the AI revise a pinned note, producing a new *version*
 * (the pin keeps its history; the reader switches between versions). Two modes:
 *
 *  - 'revise'  — rewrite the current pin text per the instruction.
 *  - 'source'  — re-read the pin's source message + recent story and rebuild it
 *                (e.g. "re-summarize with what's happened since").
 *
 * Only builds the prompt; the caller runs it through the OpenAI-compatible
 * client and stores the result via `addPinVersion`. Placement follows the
 * app's U-shaped rule: grounding first, material in the middle, instruction last.
 */

import { CardInfo, PinFormat } from '../types';
import { cardToPromptBlock } from './cardContext';
import { ChatMsg } from './aiClient';

export type PinUpdateMode = 'revise' | 'source';

/** Chars of recent story fed in 'source' mode. */
export const PIN_SOURCE_CHAR_CAP = 6000;

export interface PinUpdateOptions {
  format: PinFormat;
  mode: PinUpdateMode;
  instruction: string;
  /** The pin's current (shown) content. */
  currentContent: string;
  /** Recent story text, required for 'source' mode (ignored otherwise). */
  sourceText?: string;
  card?: CardInfo;
}

const DEFAULT_INSTRUCTION: Record<PinUpdateMode, string> = {
  revise: 'Improve and tighten this note; keep its meaning and facts.',
  source: 'Rebuild this note from the story so far, keeping it current.',
};

/** Build the [system, user] messages that update a pin into a new version. */
export const buildPinUpdateMessages = (opts: PinUpdateOptions): ChatMsg[] => {
  const fmt = opts.format === 'html' ? 'HTML' : 'Markdown';
  const instruction = opts.instruction.trim() || DEFAULT_INSTRUCTION[opts.mode];

  const system = [
    'You maintain a short reference note ("pin") that sits beside a story for the reader.',
    `Update the note per the reader's instruction. Keep it in ${fmt} format.`,
    'Output ONLY the updated note content — no preamble, no explanation, no code fences.',
  ].join('\n');

  const cardBlock = cardToPromptBlock(opts.card);
  const source = opts.mode === 'source'
    ? (opts.sourceText ?? '').slice(-PIN_SOURCE_CHAR_CAP).trim()
    : '';

  const user = [
    cardBlock && `STORY CONTEXT (for grounding only):\n${cardBlock}`,
    source && `STORY SO FAR (most recent material):\n${source}`,
    `CURRENT NOTE:\n${opts.currentContent}`,
    `INSTRUCTION: ${instruction}`,
  ].filter(Boolean).join('\n\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
};
