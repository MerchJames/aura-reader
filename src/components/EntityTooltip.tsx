import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gem, MapPin, UserRound } from 'lucide-react';
import { useAppStore } from '../store';
import {
  CodexEntity, committedCount, useAuraV2Store, visibleEntities,
} from '../stores/useAuraV2Store';

export const KIND_ICON = {
  character: UserRound,
  location: MapPin,
  item: Gem,
} as const;

export const KIND_LABEL = {
  character: 'Character',
  location: 'Location',
  item: 'Item',
} as const;

/* ------------------------------------------------------------------ */
/* Tooltip mention                                                     */
/* ------------------------------------------------------------------ */

/**
 * An inline lore word. Deliberately whisper-quiet by default — a dotted
 * underline you only notice when you look for it — so the reading flow
 * stays immersive. Hover reveals what the reader already knows; click
 * opens the full codex entry.
 */
export const EntityTooltip = ({
  entity, children,
}: {
  entity: CodexEntity;
  children: React.ReactNode;
}) => {
  const [tip, setTip] = useState<{ x: number; y: number; below: boolean } | null>(null);

  const show = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const below = r.top < 150;
    setTip({ x: r.left + r.width / 2, y: below ? r.bottom : r.top, below });
  };

  const openCodex = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v2 = useAuraV2Store.getState();
    v2.setCodexTab(entity.kind);
    v2.setCodexFocusId(entity.id);
    v2.setCodexOpen(true);
    setTip(null);
  };

  const Icon = KIND_ICON[entity.kind];

  return (
    <>
      <span
        className="cursor-help border-b border-dotted border-accent/50 box-decoration-clone"
        onMouseEnter={show}
        onMouseLeave={() => setTip(null)}
        onClick={openCodex}
      >
        {children}
      </span>
      {tip && createPortal(
        <div
          className="fixed z-[80] w-72 max-w-[80vw] rounded-xl bg-surface border border-app-border shadow-2xl p-3 pointer-events-none"
          style={{
            left: Math.min(Math.max(tip.x, 150), window.innerWidth - 150),
            top: tip.below ? tip.y + 8 : tip.y - 8,
            transform: tip.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Icon size={14} className="text-accent shrink-0" />
            <span className="font-bold text-sm">{entity.name}</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider text-muted">
              {KIND_LABEL[entity.kind]}
            </span>
          </div>
          <p className="text-xs leading-relaxed opacity-85">{entity.summary}</p>
          <p className="text-[10px] text-muted mt-1.5">
            {entity.mentions} mention{entity.mentions === 1 ? '' : 's'} so far · click for codex
          </p>
        </div>,
        document.body,
      )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Text highlighter                                                    */
/* ------------------------------------------------------------------ */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Matcher {
  regex: RegExp;
  byName: Map<string, CodexEntity>;
}

const buildMatcher = (entities: CodexEntity[]): Matcher | null => {
  const byName = new Map<string, CodexEntity>();
  const names: string[] = [];
  for (const e of entities) {
    for (const n of [e.name, ...e.aliases]) {
      const key = n.trim();
      if (key.length < 3 || byName.has(key.toLowerCase())) continue;
      byName.set(key.toLowerCase(), e);
      names.push(escapeRe(key));
    }
  }
  if (names.length === 0) return null;
  // Longest-first alternation so "Mira Valen" wins over the alias "Mira"
  // when both could match at the same spot (overlap handling).
  names.sort((a, b) => b.length - a.length);
  return {
    regex: new RegExp(`(?<![\\w])(${names.join('|')})(?![\\w])`, 'gi'),
    byName,
  };
};

/**
 * Wrap recognized lore words in a string with <EntityTooltip>. Each entity
 * is marked at most once per text block — enough to invite a hover without
 * turning the page into a link farm.
 */
const markString = (
  text: string, matcher: Matcher, seen: Set<string>, keyBase: string,
): React.ReactNode => {
  matcher.regex.lastIndex = 0;
  if (!matcher.regex.test(text)) return text;
  matcher.regex.lastIndex = 0;

  const out: React.ReactNode[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = matcher.regex.exec(text))) {
    const entity = matcher.byName.get(m[1].toLowerCase());
    if (!entity || seen.has(entity.id)) continue;
    seen.add(entity.id);
    if (m.index > cursor) out.push(text.slice(cursor, m.index));
    out.push(
      <EntityTooltip key={`${keyBase}-${k++}`} entity={entity}>{m[1]}</EntityTooltip>,
    );
    cursor = m.index + m[1].length;
  }
  if (out.length === 0) return text;
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
};

/**
 * Hook used by the reader's markdown renderers. Returns a `mark` function
 * that decorates the string children of a rendered block; non-string
 * children (nested elements) are left for their own renderers. Returns an
 * identity function when highlighting is off or nothing is known yet, so
 * the reader pays zero cost by default.
 */
export const useEntityHighlighter = (): ((children: React.ReactNode) => React.ReactNode) => {
  const storyId = useAppStore(s => s.currentStory?.id);
  const readCount = useAppStore(s =>
    s.chains.length === 0
      ? 0
      : committedCount(s.chains, s.currentChainIndex, s.currentMessageIndex, !!s.streamingMessage));
  const enabled = useAuraV2Store(s => s.codexEnabled && s.codexHighlight);
  const entities = useAuraV2Store(s => (storyId ? s.codexByStory[storyId] : undefined));

  return useMemo(() => {
    if (!enabled || !entities || entities.length === 0) return (c: React.ReactNode) => c;
    const matcher = buildMatcher(visibleEntities(entities, readCount));
    if (!matcher) return (c: React.ReactNode) => c;

    return (children: React.ReactNode): React.ReactNode => {
      const seen = new Set<string>();
      const walk = (node: React.ReactNode, i: number): React.ReactNode => {
        if (typeof node === 'string') return markString(node, matcher, seen, `em${i}`);
        if (Array.isArray(node)) return node.map((n, j) => walk(n, i * 100 + j));
        return node;
      };
      return walk(children, 1);
    };
  }, [enabled, entities, readCount]);
};
