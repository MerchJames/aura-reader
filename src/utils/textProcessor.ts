import { AutoFormatRule, Role } from '../types';

export interface ProcessOptions {
  hideMetadata?: boolean;
  autoFormat?: boolean;
  autoFormatRules?: AutoFormatRule[];
  /** Auto-format sub-features; default on except dialogueOwnLine/smartTypography. */
  paragraphSpacing?: boolean;
  dialogueOwnLine?: boolean;
  smartTypography?: boolean;
  styleQuotes?: boolean;
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

export const processText = (text: string, opts: ProcessOptions = {}) => {
  let processed = text;

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
  let out = text;
  const boldCount = (out.match(/\*\*/g) ?? []).length;
  if (boldCount % 2 === 1) out += '**';
  const singleCount = (out.replace(/\*\*/g, '').match(/\*/g) ?? []).length;
  if (singleCount % 2 === 1) out += '*';
  const ticks = (out.match(/`/g) ?? []).length;
  if (ticks % 2 === 1) out += '`';
  return out;
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
