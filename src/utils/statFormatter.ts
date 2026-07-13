import { StatDisplay, StatRule } from '../types';

export interface StatEntry {
  key: string;
  value: string;
  index: number;
  length: number;
  display: StatDisplay;
}

/**
 * Turn a user-written pattern like "[{key}] {value}" into a RegExp that
 * captures key/value pairs in running text. Keys are normalized to a
 * display label; values keep their original spacing.
 */
const patternToRegex = (pattern: string): RegExp | null => {
  // When {value} is the last thing in the pattern (e.g. "[{key}] {value}"),
  // there's no trailing literal to bound it, so a plain non-greedy capture
  // grabs a single character ("[Health] 100" → "1"). Anchor it to the next
  // natural boundary — another [tag], a double space, or end of line — so
  // the whole value comes through. Patterns that already close the value
  // (e.g. "[{key}: {value}]") keep the simple capture, bounded by the literal.
  const terminalValue = /\{value\}\s*$/.test(pattern);
  const valueGroup = terminalValue
    ? '(?<value>[^\\]\\[{}:;|\\n]+?)(?=\\s{2,}|\\s*\\[|\\s*\\n|\\s*$)'
    : '(?<value>[^\\]\\[{}:;|\\n]+?)';
  // Escape regex specials, then restore the placeholders as capture groups.
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace('\\{key\\}', '(?<key>[^\\]\\[{}:;|\\n]+?)')
    .replace('\\{value\\}', valueGroup);
  try {
    return new RegExp(escaped, 'gi');
  } catch {
    return null;
  }
};

const NUMERIC_RE = /^[+-]?\d+(?:\.\d+)?\s*%?$/;
const BAR_KEYS = new Set([
  'health', 'hp', 'mana', 'mp', 'stamina', 'sp', 'energy', 'shield', 'armor',
  'sanity', 'morale', 'will', 'resolve',
]);

const normalizeKey = (key: string): string =>
  key.trim().replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/**
 * Extract stat key/value tokens from text using the configured rules.
 * Returns the entries and the text with the matched tokens removed.
 */
export const extractStats = (
  text: string,
  rules: StatRule[],
): { entries: StatEntry[]; remaining: string } => {
  const entries: StatEntry[] = [];
  let remaining = text;
  const seen = new Set<string>();

  rules.filter(r => r.enabled).forEach(rule => {
    const re = patternToRegex(rule.pattern);
    if (!re) return;
    if (rule.display === 'hide') {
      remaining = remaining.replace(re, '');
      return;
    }
    remaining = remaining.replace(re, (match, ...args) => {
      const groups = args[args.length - 1] as { key?: string; value?: string } | undefined;
      const key = groups?.key ?? '';
      const value = groups?.value ?? '';
      if (!key.trim() || !value.trim()) return match;
      const id = `${normalizeKey(key)}|${value.trim()}`;
      if (seen.has(id)) return '';
      seen.add(id);
      entries.push({ key: normalizeKey(key), value: value.trim(), index: 0, length: match.length, display: rule.display });
      return '';
    });
  });

  // Tidy up leftover whitespace from removed tokens.
  remaining = remaining.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { entries, remaining };
};

/** Whether a stat looks like a fractional bar candidate. */
export const isBarStat = (key: string, value: string): boolean => {
  if (!NUMERIC_RE.test(value)) return false;
  const lower = key.toLowerCase();
  return BAR_KEYS.has(lower) || lower.endsWith(' hp') || lower.endsWith(' mp') || lower.endsWith(' sp');
};

/**
 * Render stat entries as a compact panel. Returns a React-friendly structure
 * plus the prose that should appear above/below it.
 */
export interface StatPanel {
  entries: StatEntry[];
  prose: string;
}

export const buildStatPanel = (text: string, rules: StatRule[]): StatPanel => {
  const { entries, remaining } = extractStats(text, rules);
  return { entries, prose: remaining };
};
