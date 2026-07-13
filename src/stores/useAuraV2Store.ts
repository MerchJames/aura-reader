import React from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist, StateStorage } from 'zustand/middleware';
import { Annotation, Chain, Message, MessageOverride, Pin, Sheet } from '../types';
import { useAppStore } from '../store';

/**
 * Debounced localStorage. This blob can hold codex data, overrides and several
 * large pinned visuals (up to ~150k chars each) — serializing and writing all
 * of it on every single `set()` (panel toggles, codex-scan ticks, annotations)
 * stutters the reader. Coalesce rapid writes into one, and flush on hide/unload
 * so nothing is lost.
 */
const debouncedLocalStorage = (delay = 500): StateStorage => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { name: string; value: string } | null = null;
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending) {
      try { localStorage.setItem(pending.name, pending.value); } catch { /* quota */ }
      pending = null;
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }
  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      pending = { name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    removeItem: (name) => {
      pending = null;
      if (timer) { clearTimeout(timer); timer = null; }
      localStorage.removeItem(name);
    },
  };
};

/* ------------------------------------------------------------------ */
/* Codex types                                                         */
/* ------------------------------------------------------------------ */

export type EntityKind = 'character' | 'location' | 'item';

export interface CodexEntity {
  id: string;
  /** Canonical display name, e.g. "Mira Valen". */
  name: string;
  kind: EntityKind;
  /** Alternate spellings/short forms that should also match in text. */
  aliases: string[];
  /**
   * Spoiler-free summary. Built only from text the reader has already
   * passed, so hovering an entity never reveals anything ahead.
   */
  summary: string;
  /** Where the entity first appeared (flat message index across chains). */
  firstSeenIndex: number;
  firstSeenMessageId: string;
  mentions: number;
  updatedAt: number;
  /** Merge priority: card (author-written) > ai > heuristic. */
  source: 'heuristic' | 'ai' | 'card';
}

const SOURCE_RANK: Record<CodexEntity['source'], number> = {
  heuristic: 0, ai: 1, card: 2,
};

export interface StoryStats {
  /** Total milliseconds spent with this story streaming. */
  msRead: number;
  lastReadAt: number;
}

/* ------------------------------------------------------------------ */
/* Multiverse graph types (plain data; MultiverseExplorer maps them    */
/* onto React Flow nodes/edges)                                        */
/* ------------------------------------------------------------------ */

export interface MvSceneData {
  type: 'scene';
  chainIndex: number;
  /** First message id of the chain — the jump target. */
  messageId: string;
  speaker: string;
  preview: string;
  messageCount: number;
  starred: boolean;
  /** Number of alternate-version fans hanging off this scene. */
  branchCount: number;
}

export interface MvVariantData {
  type: 'variant';
  chainIndex: number;
  messageId: string;
  swipeIndex: number;
  preview: string;
  /** This version is the one currently woven into the reading path. */
  active: boolean;
}

export interface MvNode {
  id: string;
  x: number;
  y: number;
  data: MvSceneData | MvVariantData;
}

export interface MvEdge {
  id: string;
  source: string;
  target: string;
  /** Part of the timeline the reader is currently on. */
  onPath: boolean;
}

export interface MvGraph {
  nodes: MvNode[];
  edges: MvEdge[];
  currentSceneId: string;
}

/** Trimmed one-line preview of a message for node labels. */
const preview = (text: string, len = 90): string => {
  const plain = text.replace(/[*_`#>[\]]+/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > len ? `${plain.slice(0, len)}…` : plain;
};

/** The swipe index currently woven into the path for a message. */
export const activeSwipeIndex = (
  msg: Message, selections: Record<string, number>,
): number => {
  if (selections[msg.id] != null) return selections[msg.id];
  const found = msg.swipes?.indexOf(msg.content) ?? -1;
  return found >= 0 ? found : 0;
};

const SPINE_X = 0;
const SPINE_GAP_Y = 130;
const FAN_X = 380;
const FAN_COL_W = 320;
const FAN_ROW_H = 96;

/**
 * Build the story DAG. The main timeline is a vertical spine of scene
 * nodes (one per chain); every message that has swipes fans its alternate
 * versions out to the right, merging back into the next scene. Chains
 * without branches stay plain spine links, so even a 5,000-scene Kobold
 * save produces a graph that pans smoothly with virtualized rendering.
 */
export const buildMultiverseGraph = (
  chains: Chain[],
  swipeSelections: Record<string, number>,
  currentChainIndex: number,
): MvGraph => {
  const nodes: MvNode[] = [];
  const edges: MvEdge[] = [];

  chains.forEach((chain, ci) => {
    const first = chain.messages[0];
    const branching = chain.messages.filter(m => m.swipes && m.swipes.length > 1);

    nodes.push({
      id: `scene-${ci}`,
      x: SPINE_X,
      y: ci * SPINE_GAP_Y,
      data: {
        type: 'scene',
        chainIndex: ci,
        messageId: first?.id ?? '',
        speaker: first?.name ?? '',
        preview: preview(first?.content ?? ''),
        messageCount: chain.messages.length,
        starred: chain.starred,
        branchCount: branching.length,
      },
    });

    if (ci > 0) {
      edges.push({
        id: `spine-${ci}`,
        source: `scene-${ci - 1}`,
        target: `scene-${ci}`,
        onPath: true,
      });
    }

    branching.forEach((msg, bi) => {
      const active = activeSwipeIndex(msg, swipeSelections);
      msg.swipes!.forEach((text, si) => {
        const id = `var-${msg.id}-${si}`;
        nodes.push({
          id,
          x: FAN_X + bi * FAN_COL_W,
          y: ci * SPINE_GAP_Y + (si - (msg.swipes!.length - 1) / 2) * FAN_ROW_H,
          data: {
            type: 'variant',
            chainIndex: ci,
            messageId: msg.id,
            swipeIndex: si,
            preview: preview(text, 70),
            active: si === active,
          },
        });
        edges.push({
          id: `e-${msg.id}-${si}`,
          source: bi === 0 ? `scene-${ci}` : `var-${branching[bi - 1].id}-${activeSwipeIndex(branching[bi - 1], swipeSelections)}`,
          target: id,
          onPath: si === active,
        });
        // Merge the fan back into the next scene so alternates read as
        // "what-ifs" that rejoin the timeline, not dead ends.
        if (bi === branching.length - 1 && ci + 1 < chains.length) {
          edges.push({
            id: `m-${msg.id}-${si}`,
            source: id,
            target: `scene-${ci + 1}`,
            onPath: si === active,
          });
        }
      });
    });
  });

  return {
    nodes,
    edges,
    currentSceneId: `scene-${Math.min(currentChainIndex, Math.max(0, chains.length - 1))}`,
  };
};

/* ------------------------------------------------------------------ */
/* Shared derived helpers                                              */
/* ------------------------------------------------------------------ */

/** Committed (fully read) message count, flat across chains. */
export const committedCount = (
  chains: Chain[], ci: number, mi: number, streaming: boolean,
): number => {
  let n = 0;
  for (let c = 0; c < ci; c++) n += chains[c]?.messages.length ?? 0;
  return n + mi + (streaming ? 0 : 1);
};

/** Flat message list in reading order. */
export const flatMessages = (chains: Chain[]): Message[] =>
  chains.flatMap(c => c.messages);

/** Entities the reader has actually met so far — the spoiler gate. */
export const visibleEntities = (
  entities: CodexEntity[], readCount: number,
): CodexEntity[] => entities.filter(e => e.firstSeenIndex < readCount);

/**
 * The reader's current branch choices: message id → selected swipe index.
 * This is the "currentBranchPath" the multiverse graph highlights.
 */
export const currentBranchPath = (): Record<string, number> => {
  const { chains, swipeSelections } = useAppStore.getState();
  const path: Record<string, number> = {};
  chains.forEach(c => c.messages.forEach(m => {
    if (m.swipes && m.swipes.length > 1) path[m.id] = activeSwipeIndex(m, swipeSelections);
  }));
  return path;
};

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

const MAX_ENTITIES_PER_STORY = 300;
const MAX_TRACKED_STORIES = 24;
const MAX_OVERRIDES_PER_STORY = 500;
const MAX_PINS_PER_STORY = 24;
/** Generous cap per pinned visual (~25k words) — big summary docs fit intact. */
const MAX_PIN_CONTENT = 150_000;

const normName = (s: string) => s.trim().toLowerCase();

interface AuraV2State {
  /* Codex data (persisted) */
  codexByStory: Record<string, CodexEntity[]>;
  /** Flat count of messages already scanned per story. */
  scanProgress: Record<string, number>;
  statsByStory: Record<string, StoryStats>;

  /* Lens override layer (persisted) */
  overridesByStory: Record<string, MessageOverride[]>;
  /** Whether the curated (override) view is active for a story. */
  lensOnByStory: Record<string, boolean>;

  /* Sheets (persisted) */
  sheetsByStory: Record<string, Sheet[]>;

  /* Anchored notes (persisted) */
  annotationsByStory: Record<string, Annotation[]>;

  /* Pinned visuals (persisted) */
  pinsByStory: Record<string, Pin[]>;

  /* Codex preferences (persisted) */
  codexEnabled: boolean;
  /** Use the configured OpenAI-compatible endpoint for extraction. */
  codexUseAI: boolean;
  /** Underline recognized lore words in the text. */
  codexHighlight: boolean;

  /* Transient UI */
  codexOpen: boolean;
  codexTab: EntityKind | 'notes';
  /** Focused entity in the sidebar (opened from an inline mention). */
  codexFocusId: string | null;
  multiverseOpen: boolean;
  recapSeen: Record<string, boolean>;
  /** Lens manager popover open (transient). */
  lensManagerOpen: boolean;
  /** Sheets panel open (transient). */
  sheetsOpen: boolean;
  /** Currently selected sheet id in the panel (transient). */
  currentSheetId: string | null;
  /** Right-margin pin dock visible (transient, defaults on). */
  pinDockOpen: boolean;

  setCodexOpen: (open: boolean) => void;
  setCodexTab: (tab: EntityKind | 'notes') => void;
  setCodexFocusId: (id: string | null) => void;
  setMultiverseOpen: (open: boolean) => void;
  setCodexEnabled: (on: boolean) => void;
  setCodexUseAI: (on: boolean) => void;
  setCodexHighlight: (on: boolean) => void;
  markRecapSeen: (storyId: string) => void;

  /** Merge freshly extracted entities into a story's codex. */
  upsertEntities: (storyId: string, incoming: Omit<CodexEntity, 'id' | 'updatedAt'>[]) => void;
  /** Bump mention counters for already-known entities. */
  addMentions: (storyId: string, counts: Record<string, number>) => void;
  removeEntity: (storyId: string, entityId: string) => void;
  setScanProgress: (storyId: string, count: number) => void;
  /** Wipe and rebuild from scratch (rescans on next tick). */
  clearCodex: (storyId: string) => void;
  addReadingTime: (storyId: string, ms: number) => void;

  /* Lens actions */
  setLensOn: (storyId: string, on: boolean) => void;
  setLensManagerOpen: (open: boolean) => void;
  /** Add or replace an override for a message. */
  setOverride: (storyId: string, override: MessageOverride) => void;
  /** Remove a specific override; omit kind to remove all overrides for the message. */
  removeOverride: (storyId: string, messageId: string, kind?: MessageOverride['kind']) => void;
  /** Remove every override for a story. */
  clearOverrides: (storyId: string) => void;

  /* Sheet actions */
  setSheetsOpen: (open: boolean) => void;
  setCurrentSheetId: (id: string | null) => void;
  addSheet: (storyId: string, sheet: Omit<Sheet, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateSheet: (storyId: string, sheetId: string, updates: Partial<Omit<Sheet, 'id'>>) => void;
  removeSheet: (storyId: string, sheetId: string) => void;
  addSheetRow: (storyId: string, sheetId: string, row?: Record<string, string>) => void;
  updateSheetCell: (storyId: string, sheetId: string, rowIndex: number, column: string, value: string) => void;
  removeSheetRow: (storyId: string, sheetId: string, rowIndex: number) => void;

  /* Pin actions */
  setPinDockOpen: (open: boolean) => void;
  addPin: (storyId: string, pin: Omit<Pin, 'id' | 'createdAt'>) => void;
  updatePin: (storyId: string, pinId: string, updates: Partial<Omit<Pin, 'id'>>) => void;
  removePin: (storyId: string, pinId: string) => void;

  /* Annotation actions */
  addAnnotation: (storyId: string, annotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateAnnotation: (storyId: string, annotationId: string, updates: Partial<Omit<Annotation, 'id'>>) => void;
  removeAnnotation: (storyId: string, annotationId: string) => void;

  /** Snap the reader to a multiverse node (scene or alternate version). */
  selectGraphNode: (data: MvSceneData | MvVariantData) => void;
}

const newId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Keep only the most recently touched stories so the codex can't grow unbounded. */
const pruneStories = <T,>(map: Record<string, T>, keep: string[]): Record<string, T> => {
  const keys = Object.keys(map);
  if (keys.length <= MAX_TRACKED_STORIES) return map;
  const keepSet = new Set(keep.slice(0, MAX_TRACKED_STORIES));
  const out: Record<string, T> = {};
  keys.forEach(k => { if (keepSet.has(k)) out[k] = map[k]; });
  return out;
};

export const useAuraV2Store = create<AuraV2State>()(
  persist(
    (set, get) => ({
      codexByStory: {},
      scanProgress: {},
      statsByStory: {},

      overridesByStory: {},
      lensOnByStory: {},

      sheetsByStory: {},
      annotationsByStory: {},
      pinsByStory: {},

      codexEnabled: true,
      codexUseAI: false,
      codexHighlight: true,

      codexOpen: false,
      codexTab: 'character',
      codexFocusId: null,
      multiverseOpen: false,
      recapSeen: {},
      lensManagerOpen: false,
      sheetsOpen: false,
      currentSheetId: null,
      pinDockOpen: true,

      setCodexOpen: (codexOpen) => set({ codexOpen, ...(codexOpen ? {} : { codexFocusId: null }) }),
      setCodexTab: (codexTab) => set({ codexTab }),
      setCodexFocusId: (codexFocusId) => set({ codexFocusId }),
      setMultiverseOpen: (multiverseOpen) => set({ multiverseOpen }),
      setCodexEnabled: (codexEnabled) => set({ codexEnabled }),
      setCodexUseAI: (codexUseAI) => set({ codexUseAI }),
      setCodexHighlight: (codexHighlight) => set({ codexHighlight }),
      markRecapSeen: (storyId) =>
        set({ recapSeen: { ...get().recapSeen, [storyId]: true } }),

      upsertEntities: (storyId, incoming) => {
        if (incoming.length === 0) return;
        const existing = get().codexByStory[storyId] ?? [];
        const byName = new Map<string, CodexEntity>();
        existing.forEach(e => {
          byName.set(normName(e.name), e);
          e.aliases.forEach(a => byName.set(normName(a), e));
        });

        const next = [...existing];
        const now = Date.now();

        incoming.forEach(inc => {
          const hit = byName.get(normName(inc.name))
            ?? inc.aliases.map(a => byName.get(normName(a))).find(Boolean);
          if (hit) {
            const idx = next.findIndex(e => e.id === hit.id);
            if (idx === -1) return;
            // Higher-trust sources refine what lower ones wrote, never the
            // other way round: card (author) > ai > heuristic.
            const upgrade = SOURCE_RANK[inc.source] >= SOURCE_RANK[hit.source];
            const better = upgrade && inc.summary.length > 12;
            next[idx] = {
              ...hit,
              kind: upgrade ? inc.kind : hit.kind,
              summary: better ? inc.summary : hit.summary,
              aliases: [...new Set([...hit.aliases, ...inc.aliases, inc.name].filter(
                a => normName(a) !== normName(hit.name),
              ))].slice(0, 6),
              mentions: hit.mentions + Math.max(1, inc.mentions),
              source: upgrade ? inc.source : hit.source,
              updatedAt: now,
            };
          } else if (next.length < MAX_ENTITIES_PER_STORY) {
            const entity: CodexEntity = { ...inc, id: newId(), updatedAt: now };
            next.push(entity);
            byName.set(normName(entity.name), entity);
            entity.aliases.forEach(a => byName.set(normName(a), entity));
          }
        });

        const touched = [storyId, ...Object.keys(get().codexByStory).filter(k => k !== storyId)];
        set({
          codexByStory: pruneStories({ ...get().codexByStory, [storyId]: next }, touched),
        });
      },

      addMentions: (storyId, counts) => {
        const list = get().codexByStory[storyId];
        if (!list || Object.keys(counts).length === 0) return;
        set({
          codexByStory: {
            ...get().codexByStory,
            [storyId]: list.map(e =>
              counts[e.id] ? { ...e, mentions: e.mentions + counts[e.id] } : e),
          },
        });
      },

      removeEntity: (storyId, entityId) => {
        const list = get().codexByStory[storyId];
        if (!list) return;
        set({
          codexByStory: {
            ...get().codexByStory,
            [storyId]: list.filter(e => e.id !== entityId),
          },
        });
      },

      setScanProgress: (storyId, count) =>
        set({ scanProgress: { ...get().scanProgress, [storyId]: count } }),

      clearCodex: (storyId) => {
        const codex = { ...get().codexByStory };
        const scan = { ...get().scanProgress };
        delete codex[storyId];
        delete scan[storyId];
        set({ codexByStory: codex, scanProgress: scan, codexFocusId: null });
      },

      addReadingTime: (storyId, ms) => {
        const prev = get().statsByStory[storyId] ?? { msRead: 0, lastReadAt: 0 };
        set({
          statsByStory: {
            ...get().statsByStory,
            [storyId]: { msRead: prev.msRead + ms, lastReadAt: Date.now() },
          },
        });
      },

      setLensOn: (storyId, on) => {
        set({ lensOnByStory: { ...get().lensOnByStory, [storyId]: on } });
      },
      setLensManagerOpen: (lensManagerOpen) => set({ lensManagerOpen }),
      setOverride: (storyId, override) => {
        const existing = get().overridesByStory[storyId] ?? [];
        const idx = existing.findIndex(
          o => o.messageId === override.messageId && o.kind === override.kind,
        );
        const next = idx === -1
          ? [...existing, override]
          : existing.map((o, i) => (i === idx ? override : o));
        const pruned = next.length > MAX_OVERRIDES_PER_STORY
          ? next.slice(next.length - MAX_OVERRIDES_PER_STORY)
          : next;
        const touched = [storyId, ...Object.keys(get().overridesByStory).filter(k => k !== storyId)];
        set({
          overridesByStory: pruneStories({ ...get().overridesByStory, [storyId]: pruned }, touched),
          lensOnByStory: { ...get().lensOnByStory, [storyId]: true },
        });
      },
      removeOverride: (storyId, messageId, kind) => {
        const existing = get().overridesByStory[storyId];
        if (!existing) return;
        const next = kind
          ? existing.filter(o => !(o.messageId === messageId && o.kind === kind))
          : existing.filter(o => o.messageId !== messageId);
        const all = { ...get().overridesByStory, [storyId]: next };
        if (next.length === 0) delete all[storyId];
        set({ overridesByStory: all });
      },
      clearOverrides: (storyId) => {
        const all = { ...get().overridesByStory };
        delete all[storyId];
        set({ overridesByStory: all });
      },

      setSheetsOpen: (sheetsOpen) => set({ sheetsOpen }),
      setCurrentSheetId: (currentSheetId) => set({ currentSheetId }),
      addSheet: (storyId, sheet) => {
        const now = Date.now();
        const next: Sheet = { ...sheet, id: newId(), createdAt: now, updatedAt: now };
        const list = [...(get().sheetsByStory[storyId] ?? []), next];
        const touched = [storyId, ...Object.keys(get().sheetsByStory).filter(k => k !== storyId)];
        set({
          sheetsByStory: pruneStories({ ...get().sheetsByStory, [storyId]: list }, touched),
          currentSheetId: next.id,
        });
      },
      updateSheet: (storyId, sheetId, updates) => {
        const list = get().sheetsByStory[storyId];
        if (!list) return;
        set({
          sheetsByStory: {
            ...get().sheetsByStory,
            [storyId]: list.map(s =>
              s.id === sheetId ? { ...s, ...updates, updatedAt: Date.now() } : s),
          },
        });
      },
      removeSheet: (storyId, sheetId) => {
        const list = get().sheetsByStory[storyId];
        if (!list) return;
        const next = list.filter(s => s.id !== sheetId);
        const all = { ...get().sheetsByStory, [storyId]: next };
        if (next.length === 0) delete all[storyId];
        set({
          sheetsByStory: all,
          currentSheetId: get().currentSheetId === sheetId ? null : get().currentSheetId,
        });
      },
      addSheetRow: (storyId, sheetId, row) => {
        const list = get().sheetsByStory[storyId];
        if (!list) return;
        set({
          sheetsByStory: {
            ...get().sheetsByStory,
            [storyId]: list.map(s =>
              s.id === sheetId
                ? { ...s, rows: [...s.rows, row ?? {}], updatedAt: Date.now() }
                : s),
          },
        });
      },
      updateSheetCell: (storyId, sheetId, rowIndex, column, value) => {
        const list = get().sheetsByStory[storyId];
        if (!list) return;
        set({
          sheetsByStory: {
            ...get().sheetsByStory,
            [storyId]: list.map(s =>
              s.id === sheetId
                ? {
                    ...s,
                    rows: s.rows.map((r, i) =>
                      i === rowIndex ? { ...r, [column]: value } : r),
                    updatedAt: Date.now(),
                  }
                : s),
          },
        });
      },
      removeSheetRow: (storyId, sheetId, rowIndex) => {
        const list = get().sheetsByStory[storyId];
        if (!list) return;
        set({
          sheetsByStory: {
            ...get().sheetsByStory,
            [storyId]: list.map(s =>
              s.id === sheetId
                ? { ...s, rows: s.rows.filter((_, i) => i !== rowIndex), updatedAt: Date.now() }
                : s),
          },
        });
      },

      setPinDockOpen: (pinDockOpen) => set({ pinDockOpen }),
      addPin: (storyId, pin) => {
        const list = get().pinsByStory[storyId] ?? [];
        if (list.length >= MAX_PINS_PER_STORY) return;
        const next: Pin = {
          ...pin,
          content: pin.content.slice(0, MAX_PIN_CONTENT),
          id: newId(),
          createdAt: Date.now(),
        };
        const touched = [storyId, ...Object.keys(get().pinsByStory).filter(k => k !== storyId)];
        set({
          pinsByStory: pruneStories({ ...get().pinsByStory, [storyId]: [...list, next] }, touched),
        });
      },
      updatePin: (storyId, pinId, updates) => {
        const list = get().pinsByStory[storyId];
        if (!list) return;
        set({
          pinsByStory: {
            ...get().pinsByStory,
            [storyId]: list.map(p => (p.id === pinId ? { ...p, ...updates } : p)),
          },
        });
      },
      removePin: (storyId, pinId) => {
        const list = get().pinsByStory[storyId];
        if (!list) return;
        const next = list.filter(p => p.id !== pinId);
        const all = { ...get().pinsByStory, [storyId]: next };
        if (next.length === 0) delete all[storyId];
        set({ pinsByStory: all });
      },

      addAnnotation: (storyId, annotation) => {
        const now = Date.now();
        const next: Annotation = { ...annotation, id: newId(), createdAt: now, updatedAt: now };
        const list = [...(get().annotationsByStory[storyId] ?? []), next];
        const touched = [storyId, ...Object.keys(get().annotationsByStory).filter(k => k !== storyId)];
        set({
          annotationsByStory: pruneStories({ ...get().annotationsByStory, [storyId]: list }, touched),
        });
      },
      updateAnnotation: (storyId, annotationId, updates) => {
        const list = get().annotationsByStory[storyId];
        if (!list) return;
        set({
          annotationsByStory: {
            ...get().annotationsByStory,
            [storyId]: list.map(a =>
              a.id === annotationId ? { ...a, ...updates, updatedAt: Date.now() } : a),
          },
        });
      },
      removeAnnotation: (storyId, annotationId) => {
        const list = get().annotationsByStory[storyId];
        if (!list) return;
        const next = list.filter(a => a.id !== annotationId);
        const all = { ...get().annotationsByStory, [storyId]: next };
        if (next.length === 0) delete all[storyId];
        set({ annotationsByStory: all });
      },

      selectGraphNode: (data) => {
        // Close the overlay first so React can commit that frame before the
        // heavy reader re-render (deep jumps can mount hundreds of messages).
        set({ multiverseOpen: false });
        React.startTransition(() => {
          const app = useAppStore.getState();
          if (data.type === 'variant') {
            // Weave the chosen version into the path, then snap the reader there.
            app.selectSwipe(data.messageId, data.swipeIndex);
          }
          if (data.messageId) app.jumpToMessage(data.messageId);
        });
      },
    }),
    {
      name: 'aura-reader-v2',
      storage: createJSONStorage(() => debouncedLocalStorage()),
      partialize: (s) => ({
        codexByStory: s.codexByStory,
        scanProgress: s.scanProgress,
        statsByStory: s.statsByStory,
        overridesByStory: s.overridesByStory,
        lensOnByStory: s.lensOnByStory,
        sheetsByStory: s.sheetsByStory,
        annotationsByStory: s.annotationsByStory,
        pinsByStory: s.pinsByStory,
        codexEnabled: s.codexEnabled,
        codexUseAI: s.codexUseAI,
        codexHighlight: s.codexHighlight,
      }),
    },
  ),
);
