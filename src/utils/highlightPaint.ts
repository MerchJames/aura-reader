import { Highlight as StoryHighlight, HIGHLIGHT_COLORS } from '../types';

/**
 * Paints saved highlights back onto the rendered text using the CSS Custom
 * Highlight API (`CSS.highlights` + `::highlight(...)` rules in index.css).
 * This colors the text in place without wrapping it in DOM nodes, so it
 * survives react-markdown re-rendering the message every streamed frame.
 *
 * Returns false when the browser lacks the API (older engines) — callers can
 * fall back to the highlights list panel, which always works.
 */

const COLOR_KEYS = HIGHLIGHT_COLORS.map(c => c.key);

interface Located {
  node: Text;
  off: number;
}

/** Every occurrence of `query` inside `scope`, as DOM Ranges. */
const findRanges = (scope: Element, query: string): Range[] => {
  const ranges: Range[] = [];
  if (!query) return ranges;

  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const starts: number[] = [];
  let full = '';
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    starts.push(full.length);
    nodes.push(n);
    full += n.nodeValue ?? '';
  }
  if (!nodes.length) return ranges;

  const locate = (pos: number): Located | null => {
    for (let i = 0; i < nodes.length; i++) {
      const len = nodes[i].nodeValue?.length ?? 0;
      if (pos <= starts[i] + len) return { node: nodes[i], off: Math.max(0, pos - starts[i]) };
    }
    const last = nodes[nodes.length - 1];
    return { node: last, off: last.nodeValue?.length ?? 0 };
  };

  let from = 0;
  while (from <= full.length) {
    const idx = full.indexOf(query, from);
    if (idx < 0) break;
    const s = locate(idx);
    const e = locate(idx + query.length);
    if (s && e) {
      try {
        const r = document.createRange();
        r.setStart(s.node, s.off);
        r.setEnd(e.node, e.off);
        ranges.push(r);
      } catch {
        /* detached / stale node — skip */
      }
    }
    from = idx + Math.max(1, query.length);
  }
  return ranges;
};

/** True when the CSS Custom Highlight API is available. */
export const highlightApiSupported = (): boolean =>
  typeof CSS !== 'undefined' && 'highlights' in CSS && typeof (window as any).Highlight === 'function';

export const paintHighlights = (root: Element | null, highlights: StoryHighlight[]): void => {
  if (!root || !highlightApiSupported()) return;
  const registry = (CSS as any).highlights as Map<string, unknown>;
  const HighlightCtor = (window as any).Highlight as new (...ranges: Range[]) => unknown;

  const byColor: Record<string, Range[]> = {};
  for (const h of highlights) {
    if (!h.text?.trim()) continue;
    const scope: Element | null = h.messageId
      ? root.querySelector(`[data-msg-id="${(window as any).CSS?.escape?.(h.messageId) ?? h.messageId}"]`)
      : root;
    if (!scope) continue;
    const color = h.color && COLOR_KEYS.includes(h.color) ? h.color : 'yellow';
    const ranges = findRanges(scope, h.text.trim());
    if (ranges.length) (byColor[color] ??= []).push(...ranges);
  }

  for (const key of COLOR_KEYS) {
    const name = `aura-${key}`;
    const ranges = byColor[key];
    if (ranges?.length) registry.set(name, new HighlightCtor(...ranges));
    else registry.delete(name);
  }
};
