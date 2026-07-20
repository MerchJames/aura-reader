import { AutoFormatRule, OocHandling, Role } from '../types';

export interface ProcessOptions {
  hideMetadata?: boolean;
  /** How to treat [OOC: ...] / (OOC: ...) out-of-character asides. */
  oocHandling?: OocHandling;
  autoFormat?: boolean;
  autoFormatRules?: AutoFormatRule[];
  /** Auto-format sub-features; default on except dialogueOwnLine/smartTypography. */
  paragraphSpacing?: boolean;
  dialogueOwnLine?: boolean;
  smartTypography?: boolean;
  styleQuotes?: boolean;
  /** Close dangling quotes / emphasis so misformatted prose renders cleanly.
   *  Presentation-only; defaults on (pass false to skip, e.g. for speech). */
  repairFormatting?: boolean;
  substituteNames?: boolean;
  characterName?: string;
  userName?: string;
  /** Role of the message, for role-targeted rules. */
  role?: Role;
}

export const ruleAppliesTo = (rule: AutoFormatRule, role?: Role): boolean =>
  !rule.appliesTo || rule.appliesTo === 'all' || !role || rule.appliesTo === role;

/** Compile a rule's regex; returns null (and no crash) for invalid patterns. */
export const compileRule = (rule: AutoFormatRule): RegExp | null => {
  try {
    return new RegExp(rule.pattern, rule.flags || 'g');
  } catch {
    return null;
  }
};

/** Validation message for the rule editor, or null when the rule is valid. */
export const ruleError = (rule: AutoFormatRule): string | null => {
  if (!rule.pattern) return 'Pattern is empty';
  try {
    new RegExp(rule.pattern, rule.flags || 'g');
    return null;
  } catch (e: any) {
    return e?.message ?? 'Invalid regular expression';
  }
};

/** Matches an OOC aside: [OOC: ...] or (OOC: ...), case-insensitive. */
const OOC_RE = /([[(])\s*OOC\b[^\])]*[\])]/gi;

/** Apply the reader's OOC preference: leave, dim (italic-muted), or remove. */
export const applyOoc = (text: string, mode: OocHandling = 'show'): string => {
  if (mode === 'show') return text;
  if (mode === 'hide') {
    // Drop the aside and tidy up the whitespace/blank line it leaves behind.
    return text.replace(OOC_RE, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
  }
  // dim: wrap in emphasis so it renders muted-italic (strip inner * to stay valid).
  return text.replace(OOC_RE, m => `*${m.replace(/\*/g, '')}*`);
};

/** Convert inline <img> HTML into markdown images so they render natively. */
export const normalizeImages = (text: string): string =>
  text.replace(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi, (_m, src) => `\n\n![](${src})\n\n`);

export const processText = (text: string, opts: ProcessOptions = {}) => {
  let processed = applyOoc(normalizeImages(text), opts.oocHandling);

  if (opts.substituteNames) {
    if (opts.characterName) processed = processed.replace(/\{\{char\}\}/gi, opts.characterName);
    if (opts.userName) processed = processed.replace(/\{\{user\}\}/gi, opts.userName);
  }

  if (opts.hideMetadata) {
    // Removes {{[INPUT]}}, {{[OUTPUT]}}, {{[SYSTEM]}}, and any generic <|tag|>
    processed = processed
      .replace(/\{\{\s*\[?INPUT\]?\s*\}\}/gi, '')
      .replace(/\{\{\s*\[?OUTPUT\]?\s*\}\}/gi, '')
      .replace(/\{\{\s*\[?SYSTEM\]?\s*\}\}/gi, '')
      .replace(/<\|.*?\|>/g, '');
  }

  if (opts.autoFormat) {
    (opts.autoFormatRules ?? [])
      .filter(r => r.enabled && ruleAppliesTo(r, opts.role))
      .forEach(rule => {
        const regex = compileRule(rule);
        if (regex) processed = processed.replace(regex, rule.replacement);
      });

    if (opts.smartTypography) {
      processed = processed
        .replace(/\.{3,}/g, '…')
        .replace(/(\w)\s*--\s*(\w)/g, '$1—$2')
        .replace(/\s+([,.!?;:])(?=\s|$)/g, '$1');
    }

    if (opts.paragraphSpacing ?? true) {
      // Single newlines become paragraph breaks
      processed = processed.replace(/([^\n])\n(?!\n)/g, '$1\n\n');
    }

    if (opts.dialogueOwnLine) {
      // Give quoted dialogue its own paragraph
      processed = processed.replace(/([^\n"“])[ \t]*(["“][^"”\n]+["”])/g, '$1\n\n$2');
      processed = processed.replace(/(["“][^"”\n]+["”])[ \t]*(?=[^\s"“])/g, '$1\n\n');
    }

    processed = processed.replace(/\n{3,}/g, '\n\n');

    // Prevent stray bullet lists: after paragraph-splitting, any line the author
    // began with `*`, `-`, or `+ ` (an action asterisk or a dash — never a real
    // list in prose roleplay) gets parsed by markdown as a list item. Escape a
    // leading marker that is followed by a space so it renders literally.
    // A leading `*word*` action has no space after the `*`, so it's untouched.
    processed = processed.replace(/^([ \t]*)([-+])([ \t]+)/gm, '$1\\$2$3');
    processed = processed.replace(/^([ \t]*)\*([ \t]+)/gm, '$1\\*$2');
  }

  // Close dangling quotes / emphasis so misformatted prose renders cleanly.
  // Runs after paragraph structure is settled but before quotes get wrapped.
  // Default on; speech/streaming callers pass false.
  if (opts.repairFormatting !== false) {
    processed = repairFormatting(processed);
  }

  if (opts.styleQuotes) {
    // Wrap quoted speech in * * so it renders as <em> and can be styled as
    // dialogue. Skip spans that already contain markdown emphasis markers.
    processed = processed.replace(
      /(^|[\s({\[—–-])"([^"*\n]+)"(?=[\s.,!?;:)}\]—–-]|$)/g,
      '$1*"$2"*',
    );
    processed = processed.replace(
      /(^|[\s({\[—–-])“([^”*\n]+)”(?=[\s.,!?;:)}\]—–-]|$)/g,
      '$1*“$2”*',
    );
    processed = processed.replace(
      /(^|[\s({\[—–-])'([^'*\n]+)'(?=[\s.,!?;:)}\]—–-]|$)/g,
      "$1*'$2'*",
    );
  }

  return { processedText: processed };
};

/** True when an emphasis span is quoted dialogue rather than an action/thought. */
export const isDialogueText = (text: string): boolean => /^["'“‘]/.test(text.trim());

/**
 * Close dangling emphasis markers so a partially streamed message renders
 * styled (italic/bold applied live) instead of showing literal asterisks.
 */
export const balanceEmphasis = (text: string): string => {
  // Drop a trailing, content-less marker run (e.g. "he said *" mid-type) so
  // the span's styling doesn't flip on/off — the main cause of "shaking" as
  // characters reveal past an asterisk or quote.
  let out = text.replace(/(?:\*{1,3}|_{1,3}|`+)$/, '');
  const boldCount = (out.match(/\*\*/g) ?? []).length;
  if (boldCount % 2 === 1) out += '**';
  const singleCount = (out.replace(/\*\*/g, '').match(/\*/g) ?? []).length;
  if (singleCount % 2 === 1) out += '*';
  const ticks = (out.match(/`/g) ?? []).length;
  if (ticks % 2 === 1) out += '`';
  return out;
};

/**
 * Repair one paragraph's dangling markup: close an unterminated quote, and
 * balance an italic/bold run that was left open (or closed) — the classic
 * roleplay breakages where dialogue is cut off (`"the razor was a blade`) or an
 * emphasis run got split across a blank line (markdown italics can't cross one).
 * Balanced text is returned unchanged. Placement mirrors the SillyTavern
 * "auto-balance" rule: a run opened at the paragraph start is closed at its end;
 * a stray closer with no opener gets one prepended.
 */
const repairParagraph = (p: string): string => {
  if (!p.trim()) return p;
  let out = p;

  // Unterminated straight double-quote → close it at the paragraph end.
  if (((out.match(/"/g) ?? []).length) % 2 === 1) out = out.replace(/(\s*)$/, '"$1');
  // Smart quotes: add as many closers as there are unmatched openers.
  const opens = (out.match(/“/g) ?? []).length;
  const closes = (out.match(/”/g) ?? []).length;
  if (opens > closes) out = out.replace(/(\s*)$/, '”'.repeat(opens - closes) + '$1');

  // Unbalanced bold → close it.
  if (((out.match(/\*\*/g) ?? []).length) % 2 === 1) out = out.replace(/(\s*)$/, '**$1');
  // Unbalanced single-asterisk italics → balance by where the run sits.
  const singles = (out.replace(/\*\*/g, '').match(/\*/g) ?? []).length;
  if (singles % 2 === 1) {
    if (/^\s*\*(?!\*)/.test(out)) out = out.replace(/(\s*)$/, '*$1'); // opened, not closed
    else out = out.replace(/^(\s*)/, '$1*');                          // closed, not opened
  }
  return out;
};

/**
 * Presentation-only formatting repair for settled prose: fixes unterminated
 * dialogue and split emphasis runs paragraph by paragraph, leaving the source
 * untouched. Code spans/blocks are guarded so their contents are never
 * rebalanced. (The streaming tail uses `balanceEmphasis` instead.)
 */
const CODE_GUARD_OPEN = '';
const CODE_GUARD_CLOSE = '';
const CODE_GUARD_RE = new RegExp(CODE_GUARD_OPEN + '(\\d+)' + CODE_GUARD_CLOSE, 'g');

export const repairFormatting = (text: string): string => {
  const stash: string[] = [];
  const guard = (s: string) => `${CODE_GUARD_OPEN}${stash.push(s) - 1}${CODE_GUARD_CLOSE}`;
  const guarded = text
    .replace(/```[\s\S]*?```/g, guard)
    .replace(/`[^`\n]*`/g, guard);

  // Even indices are paragraphs; odd indices are the \n\n separators (kept as-is).
  const repaired = guarded
    .split(/(\n{2,})/)
    .map((seg, i) => (i % 2 === 0 ? repairParagraph(seg) : seg))
    .join('');

  return repaired.replace(CODE_GUARD_RE, (_m, n) => stash[Number(n)]);
};

/**
 * For the live-streaming message only: drop the trailing in-progress word so
 * the rendered text never contains a partial word that grows and re-wraps at
 * the right margin every frame (the residual "streaming shake"). The hidden
 * final word appears as soon as its terminating space/newline streams in, or
 * when the message commits. Left untouched when there's no whitespace yet.
 */
export const truncateToWord = (text: string): string => {
  // Already ends on a boundary — nothing in progress to hide.
  if (!text || /\s$/.test(text)) return text;
  const lastBreak = Math.max(text.lastIndexOf(' '), text.lastIndexOf('\n'));
  if (lastBreak <= 0) return text; // single unbroken token — show it
  return text.slice(0, lastBreak + 1);
};

/** Strip markdown/markup for text-to-speech. */
export const plainTextForSpeech = (text: string): string =>
  text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_`~#]+/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
