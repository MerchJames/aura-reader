/**
 * Expressive reading — render-time typography and reveal-pacing heuristics that
 * make prose feel *performed* without any AI pass. Everything here is pure and
 * cheap: shout detection keys off capitalization, pacing keys off quote state
 * and punctuation at the reveal cursor. (Reliable whisper/emotion cues need the
 * Scene Director metadata pass — deliberately out of scope here.)
 *
 * Strength is tunable via three intensity presets (subtle / expressive /
 * cinematic) — see PACING_BY_INTENSITY for the reveal side; the typographic
 * side scales through CSS vars set by the matching `.expr-<intensity>` class.
 */

/**
 * True when a token reads as a shout — all-caps with real letters, e.g. "STOP",
 * "GET OUT", "NO!". Surrounding punctuation is ignored so "NO!" still counts;
 * a single letter ("I", "A") or any lowercase disqualifies it.
 */
/** Strip surrounding punctuation from a token and lowercase it, for matching
 *  against Scene Director emphasis spans. */
export const normalizeWord = (raw: string): string =>
  raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();

export const isShoutWord = (raw: string): boolean => {
  const w = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (w.length < 2) return false;
  const letters = w.match(/\p{L}/gu);
  if (!letters || letters.length < 2) return false;   // need ≥2 letters
  if (/\p{Ll}/u.test(w)) return false;                // any lowercase → not a shout
  return /\p{Lu}/u.test(w);                            // must contain uppercase letters
};

/** Whether the character position `index` sits inside a quoted span. */
export const insideQuote = (text: string, index: number): boolean => {
  let count = 0;
  const end = Math.min(index, text.length);
  for (let i = 0; i < end; i++) {
    const c = text[i];
    if (c === '"' || c === '“' || c === '”' || c === '«' || c === '»') count++;
  }
  return count % 2 === 1;
};

export interface PacingConfig {
  /** Reveal-rate multiplier inside quoted dialogue (<1 = linger). */
  dialogueMul: number;
  /** Reveal-rate multiplier in narration/action (>1 = quicken). */
  actionMul: number;
  /** Hold after a sentence-final mark (ms, before speed scaling). */
  sentenceHold: number;
  /** Hold after a paragraph / scene break (ms, before speed scaling). */
  paragraphHold: number;
}

export type ExpressiveIntensity = 'subtle' | 'expressive' | 'cinematic';

/**
 * Pacing presets per intensity. "Subtle" barely deviates from a flat rate;
 * "cinematic" leans hard into the linger/quicken split and holds long beats.
 * All multipliers stay near 1 so total reading time drifts only a little.
 */
export const PACING_BY_INTENSITY: Record<ExpressiveIntensity, PacingConfig> = {
  subtle: { dialogueMul: 0.88, actionMul: 1.06, sentenceHold: 110, paragraphHold: 300 },
  expressive: { dialogueMul: 0.75, actionMul: 1.15, sentenceHold: 220, paragraphHold: 550 },
  cinematic: { dialogueMul: 0.6, actionMul: 1.28, sentenceHold: 340, paragraphHold: 820 },
};

/** Back-compat alias — the default "Expressive" preset. */
export const EXPRESSIVE_PACING: PacingConfig = PACING_BY_INTENSITY.expressive;

/** Pacing config for an intensity, tolerant of an unknown value. */
export const pacingFor = (intensity: ExpressiveIntensity): PacingConfig =>
  PACING_BY_INTENSITY[intensity] ?? EXPRESSIVE_PACING;

/** Reveal-rate multiplier for the text about to be revealed at `revealedLen`. */
export const rateMultiplier = (text: string, revealedLen: number, cfg: PacingConfig): number =>
  insideQuote(text, revealedLen) ? cfg.dialogueMul : cfg.actionMul;

/**
 * Dramatic hold (ms) triggered by the character that was just revealed at
 * `revealedLen - 1`: a beat after sentence-final punctuation, a longer one at a
 * blank-line paragraph/scene break. Returns 0 when no boundary was crossed.
 * The caller scales this by reading speed.
 */
export const holdMsAt = (text: string, revealedLen: number, cfg: PacingConfig): number => {
  if (revealedLen <= 0 || revealedLen > text.length) return 0;
  const c = text[revealedLen - 1];

  if (c === '\n') {
    let n = 0;
    for (let i = revealedLen - 1; i >= 0 && text[i] === '\n'; i--) n++;
    return n >= 2 ? cfg.paragraphHold : 0; // blank line = paragraph/scene beat
  }

  const next = text[revealedLen] ?? '';
  if (/[.!?…]/.test(c) && (next === '' || /\s/.test(next))) return cfg.sentenceHold;
  return 0;
};

/** Faster readers get proportionally shorter dramatic holds. */
export const holdSpeedScale = (speed: number): number =>
  Math.max(0.4, Math.min(1.4, 45 / Math.max(1, speed)));
