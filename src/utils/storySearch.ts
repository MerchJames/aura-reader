/**
 * Full-story search — searches the resolved text of *every* message across all
 * chains (not just what's on screen), for fact-checking. The index is built
 * once per story (lowercased copies) and reused; queries are plain substring
 * scans, cheap enough to run on a debounced keystroke even for large stories.
 */

export interface SearchItem {
  id: string;
  name: string;
  content: string;
  chainIndex: number;
  messageIndex: number;
}

export interface SearchEntry extends SearchItem {
  lower: string;
  nameLower: string;
}

export interface SearchHit {
  id: string;
  name: string;
  chainIndex: number;
  messageIndex: number;
  /** Snippet around the first match — split so the match can be highlighted. */
  pre: string;
  hit: string;
  post: string;
  /** Number of occurrences in this message (capped). */
  count: number;
}

/** Minimum query length before searching (avoids matching everything). */
export const MIN_QUERY = 2;
const SNIPPET_PAD = 44;
const MAX_COUNT = 99;

/** Collapse whitespace/newlines so a snippet reads as one clean line. */
const collapse = (s: string): string => s.replace(/\s+/g, ' ');

/** Pre-lowercase every message once; reused across keystrokes. */
export const buildSearchIndex = (items: SearchItem[]): SearchEntry[] =>
  items.map(it => ({ ...it, lower: it.content.toLowerCase(), nameLower: it.name.toLowerCase() }));

/**
 * Find every message matching `query` (in its text or speaker name), with a
 * highlightable snippet around the first hit. Results are capped at `limit`.
 */
export const searchStory = (
  index: SearchEntry[],
  query: string,
  limit = 60,
): SearchHit[] => {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY) return [];
  const hits: SearchHit[] = [];
  for (const e of index) {
    const at = e.lower.indexOf(q);
    const nameHit = e.nameLower.includes(q);
    if (at === -1 && !nameHit) continue;

    // Count occurrences in the body (capped).
    let count = 0;
    for (let i = e.lower.indexOf(q); i !== -1 && count < MAX_COUNT; i = e.lower.indexOf(q, i + q.length)) {
      count++;
    }

    const pos = at === -1 ? 0 : at;
    const matchLen = at === -1 ? 0 : q.length;
    const start = Math.max(0, pos - SNIPPET_PAD);
    const end = Math.min(e.content.length, pos + matchLen + SNIPPET_PAD);
    hits.push({
      id: e.id,
      name: e.name,
      chainIndex: e.chainIndex,
      messageIndex: e.messageIndex,
      pre: (start > 0 ? '…' : '') + collapse(e.content.slice(start, pos)),
      hit: e.content.slice(pos, pos + matchLen),
      post: collapse(e.content.slice(pos + matchLen, end)) + (end < e.content.length ? '…' : ''),
      count,
    });
    if (hits.length >= limit) break;
  }
  return hits;
};
