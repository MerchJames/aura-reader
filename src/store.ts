import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  AppConfig, AppState, Chain, ChainStarSettings, Message, Story, StoryFormat,
} from './types';
import { parseFile } from './utils/parser';
import { deleteStory, getAllStoryMetas, getStory, putStory } from './lib/storage';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const buildChains = (
  messages: Message[],
  format: StoryFormat,
  stars?: Record<string, ChainStarSettings>,
): Chain[] => {
  const chains: Chain[] = [];
  let current: Chain | null = null;

  const startChain = (msg: Message) => {
    if (current) chains.push(current);
    const id = `chain-${msg.id}`;
    current = {
      id,
      messages: [msg],
      starred: !!stars?.[id],
      starSettings: stars?.[id],
    };
  };

  messages.forEach(msg => {
    // Kobold saves are continuous prose: every action is its own "page".
    if (!current || msg.role === 'user' || format === 'kobold') {
      startChain(msg);
    } else {
      current.messages.push(msg);
    }
  });
  if (current) chains.push(current);
  return chains;
};

const collectStars = (chains: Chain[]): Record<string, ChainStarSettings> => {
  const stars: Record<string, ChainStarSettings> = {};
  chains.forEach(c => {
    if (c.starred) stars[c.id] = c.starSettings ?? {};
  });
  return stars;
};

/** Messages up to and including position [ci][mi], respecting the layout. */
const visibleThrough = (
  chains: Chain[], ci: number, mi: number, layoutMode: 'continuous' | 'paginated',
): Message[] => {
  const out: Message[] = [];
  if (layoutMode === 'continuous') {
    for (let c = 0; c < ci; c++) out.push(...chains[c].messages);
  }
  out.push(...(chains[ci]?.messages.slice(0, mi + 1) ?? []));
  return out;
};

const nextPosition = (chains: Chain[], ci: number, mi: number) => {
  if (chains[ci] && mi + 1 < chains[ci].messages.length) return { ci, mi: mi + 1 };
  if (ci + 1 < chains.length) return { ci: ci + 1, mi: 0 };
  return null;
};

const prevPosition = (chains: Chain[], ci: number, mi: number) => {
  if (mi > 0) return { ci, mi: mi - 1 };
  if (ci > 0) return { ci: ci - 1, mi: chains[ci - 1].messages.length - 1 };
  return null;
};

/** Messages shown before the message at [ci][mi] starts streaming. */
const visibleBefore = (
  chains: Chain[], ci: number, mi: number, layoutMode: 'continuous' | 'paginated',
): Message[] => {
  const prev = prevPosition(chains, ci, mi);
  if (!prev) return [];
  // In paginated mode a new chain starts a fresh page.
  if (layoutMode === 'paginated' && prev.ci !== ci) return [];
  return visibleThrough(chains, prev.ci, prev.mi, layoutMode);
};

const findMessage = (chains: Chain[], id: string) => {
  for (let c = 0; c < chains.length; c++) {
    const m = chains[c].messages.findIndex(msg => msg.id === id);
    if (m !== -1) return { ci: c, mi: m };
  }
  return null;
};

const newId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const CONFIG_KEYS: (keyof AppConfig)[] = [
  'theme', 'fontFamily', 'fontSize', 'textColor', 'bgColor', 'animationStyle',
  'hideMetadata', 'playbackSpeed', 'autoStream', 'autoFormat', 'autoFormatRules',
  'paragraphSpacing', 'dialogueOwnLine', 'smartTypography',
  'styleQuotes', 'substituteNames', 'dialogueColor', 'dialogueStyle', 'dialogueAnimation',
  'revealMode', 'messagePause', 'pauseAtPageEnd', 'ttsEnabled', 'ttsVoiceURI', 'ttsRate',
];

const pickConfig = (state: AppState): AppConfig => {
  const config = {} as Record<string, unknown>;
  CONFIG_KEYS.forEach(k => { config[k] = state[k]; });
  return config as unknown as AppConfig;
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      /** Snapshot current reading state back onto the story record. */
      const buildStorySnapshot = (): Story | null => {
        const { currentStory, chains, currentChainIndex, currentMessageIndex } = get();
        if (!currentStory) return null;
        const messages = chains.flatMap(c => c.messages);
        let readCount = 0;
        for (let c = 0; c < currentChainIndex; c++) readCount += chains[c]?.messages.length ?? 0;
        readCount += currentMessageIndex + (get().streamingMessage ? 0 : 1);
        return {
          ...currentStory,
          messages,
          messageCount: messages.length,
          stars: collectStars(chains),
          progress: { chainIndex: currentChainIndex, messageIndex: currentMessageIndex },
          progressPct: messages.length
            ? Math.min(100, Math.round((readCount / messages.length) * 100))
            : 0,
        };
      };

      const persistNow = () => {
        const snapshot = buildStorySnapshot();
        if (!snapshot) return;
        set({
          currentStory: snapshot,
          library: get().library.map(m =>
            m.id === snapshot.id
              ? {
                  ...m,
                  progress: snapshot.progress,
                  progressPct: snapshot.progressPct,
                  messageCount: snapshot.messageCount,
                }
              : m,
          ),
        });
        void putStory(snapshot).catch(e => console.error('Failed to save story', e));
      };

      const schedulePersist = () => {
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = setTimeout(persistNow, 800);
      };

      return {
        /* ----- config defaults ----- */
        theme: 'dark',
        fontFamily: 'sans',
        fontSize: 16,
        textColor: '#ffffff',
        bgColor: '#111827',
        animationStyle: 'typewriter',
        hideMetadata: true,
        playbackSpeed: 50,
        autoStream: true,
        autoFormat: true,
        autoFormatRules: [],
        paragraphSpacing: true,
        dialogueOwnLine: false,
        smartTypography: false,
        styleQuotes: true,
        substituteNames: true,
        revealMode: 'character',
        messagePause: 400,
        pauseAtPageEnd: false,
        ttsEnabled: false,
        ttsVoiceURI: '',
        ttsRate: 1,
        dialogueColor: 'text-indigo-600 dark:text-indigo-300',
        dialogueStyle: 'normal',
        dialogueAnimation: 'zoom',

        /* ----- library ----- */
        screen: 'library',
        library: [],
        libraryLoaded: false,
        currentStory: null,

        /* ----- playback ----- */
        chains: [],
        visibleMessages: [],
        streamingMessage: null,
        streamedText: '',
        currentChainIndex: 0,
        currentMessageIndex: 0,
        isStreaming: false,

        /* ----- view ----- */
        viewMode: 'chat',
        layoutMode: 'continuous',
        searchQuery: '',
        isAutofocusMode: false,
        autofocusZoom: 1,
        autofocusPanX: 0,
        isHighlightMode: false,
        reverseStream: false,
        controlsMinimized: false,
        settingsOpen: false,
        savedConfigs: {},
        ttsPending: false,
        awaitingAdvance: false,

        /* ----- library actions ----- */

        initLibrary: async () => {
          try {
            const library = await getAllStoryMetas();
            set({ library, libraryLoaded: true });
          } catch (e) {
            console.error('Failed to load library', e);
            set({ libraryLoaded: true });
          }
        },

        importFiles: async (files: File[]) => {
          const errors: string[] = [];
          const imported: Story[] = [];

          for (const file of files) {
            try {
              const parsed = await parseFile(file);
              if (parsed.messages.length === 0) {
                errors.push(`${file.name}: no messages found`);
                continue;
              }
              const story: Story = {
                id: newId(),
                title: parsed.title,
                format: parsed.format,
                characterName: parsed.characterName,
                userName: parsed.userName,
                avatar: parsed.avatar,
                messages: parsed.messages,
                messageCount: parsed.messages.length,
                importedAt: Date.now(),
                progress: null,
                highlights: [],
                stars: {},
              };
              await putStory(story);
              imported.push(story);
            } catch (e: any) {
              errors.push(`${file.name}: ${e?.message ?? 'failed to parse'}`);
            }
          }

          if (imported.length > 0) {
            const metas = imported.map(({ messages: _m, highlights: _h, stars: _s, ...meta }) => meta);
            set({ library: [...metas, ...get().library] });
          }
          if (imported.length === 1 && files.length === 1) {
            await get().openStory(imported[0].id);
          }
          return { imported: imported.length, errors };
        },

        openStory: async (id: string) => {
          const story = await getStory(id);
          if (!story) return;

          const { autoStream, layoutMode, viewMode } = get();
          const chains = buildChains(story.messages, story.format, story.stars);
          const readingView = viewMode === 'storybook' || viewMode === 'chat'
            ? viewMode
            : (story.format === 'kobold' ? 'storybook' : 'chat');

          const base = {
            currentStory: story,
            chains,
            screen: 'reader' as const,
            viewMode: readingView,
            searchQuery: '',
            streamedText: '',
            reverseStream: false,
          };

          const p = story.progress;
          const resumeTarget = p ? chains[p.chainIndex]?.messages[p.messageIndex] : undefined;

          if (resumeTarget && p) {
            // Resume: everything before the saved position is shown, the saved
            // message streams next.
            set({
              ...base,
              visibleMessages: visibleBefore(chains, p.chainIndex, p.messageIndex, layoutMode),
              streamingMessage: resumeTarget,
              currentChainIndex: p.chainIndex,
              currentMessageIndex: p.messageIndex,
              isStreaming: autoStream,
            });
          } else if (autoStream) {
            set({
              ...base,
              visibleMessages: [],
              streamingMessage: chains[0]?.messages[0] ?? null,
              currentChainIndex: 0,
              currentMessageIndex: 0,
              isStreaming: true,
            });
          } else {
            const ci = layoutMode === 'continuous' ? chains.length - 1 : 0;
            const mi = (chains[ci]?.messages.length ?? 1) - 1;
            set({
              ...base,
              visibleMessages: visibleThrough(chains, ci, mi, layoutMode),
              streamingMessage: null,
              currentChainIndex: ci,
              currentMessageIndex: mi,
              isStreaming: false,
            });
          }
        },

        closeStory: () => {
          if (persistTimer) clearTimeout(persistTimer);
          persistNow();
          set({
            screen: 'library',
            currentStory: null,
            chains: [],
            visibleMessages: [],
            streamingMessage: null,
            streamedText: '',
            currentChainIndex: 0,
            currentMessageIndex: 0,
            isStreaming: false,
            isAutofocusMode: false,
            searchQuery: '',
          });
        },

        deleteStoryById: async (id: string) => {
          await deleteStory(id);
          set({ library: get().library.filter(m => m.id !== id) });
          if (get().currentStory?.id === id) {
            set({
              screen: 'library', currentStory: null, chains: [], visibleMessages: [],
              streamingMessage: null, streamedText: '', isStreaming: false,
            });
          }
        },

        persistStoryState: () => schedulePersist(),

        /* ----- playback actions ----- */

        setIsStreaming: (on) => {
          if (!on) {
            set({ isStreaming: false, awaitingAdvance: false });
            schedulePersist();
            return;
          }
          const { streamingMessage, chains, currentChainIndex: ci, currentMessageIndex: mi, layoutMode } = get();
          if (chains.length === 0) return;

          if (streamingMessage) {
            set({ isStreaming: true });
            return;
          }
          // Paused with the current position fully shown: continue with the
          // next message, or restart from the top if we're at the end.
          const next = nextPosition(chains, ci, mi);
          if (next) {
            set({
              isStreaming: true,
              streamingMessage: chains[next.ci].messages[next.mi],
              streamedText: '',
              currentChainIndex: next.ci,
              currentMessageIndex: next.mi,
              visibleMessages: layoutMode === 'paginated' && next.ci !== ci
                ? []
                : get().visibleMessages,
            });
          } else {
            set({
              isStreaming: true,
              visibleMessages: [],
              streamingMessage: chains[0]?.messages[0] ?? null,
              streamedText: '',
              currentChainIndex: 0,
              currentMessageIndex: 0,
            });
          }
        },

        setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),

        advanceMessage: () => {
          const {
            chains, currentChainIndex: ci, currentMessageIndex: mi,
            streamingMessage, visibleMessages, layoutMode,
          } = get();
          if (!streamingMessage) {
            set({ isStreaming: false });
            return;
          }
          const committed = [...visibleMessages, streamingMessage];
          const next = nextPosition(chains, ci, mi);
          if (!next) {
            set({ visibleMessages: committed, streamingMessage: null, streamedText: '', isStreaming: false });
            schedulePersist();
            return;
          }
          // Optionally stop at the end of each page; play/next-page resumes.
          if (next.ci !== ci && get().layoutMode === 'paginated' && get().pauseAtPageEnd) {
            set({ visibleMessages: committed, streamingMessage: null, streamedText: '', isStreaming: false });
            schedulePersist();
            return;
          }
          set({
            visibleMessages: layoutMode === 'paginated' && next.ci !== ci ? [] : committed,
            streamingMessage: chains[next.ci].messages[next.mi],
            streamedText: '',
            currentChainIndex: next.ci,
            currentMessageIndex: next.mi,
          });
          schedulePersist();
        },

        updateStreamedText: (streamedText) => set({ streamedText }),

        finishCurrentMessage: () => {
          const { streamingMessage } = get();
          if (streamingMessage) set({ streamedText: streamingMessage.content });
        },

        resetPlayback: () => {
          const { autoStream, layoutMode, chains } = get();
          if (chains.length === 0) return;
          if (autoStream) {
            set({
              visibleMessages: [],
              streamingMessage: chains[0]?.messages[0] ?? null,
              streamedText: '',
              currentChainIndex: 0,
              currentMessageIndex: 0,
              isStreaming: false,
            });
          } else {
            const ci = layoutMode === 'continuous' ? chains.length - 1 : 0;
            const mi = (chains[ci]?.messages.length ?? 1) - 1;
            set({
              visibleMessages: visibleThrough(chains, ci, mi, layoutMode),
              streamingMessage: null,
              streamedText: '',
              currentChainIndex: ci,
              currentMessageIndex: mi,
              isStreaming: false,
            });
          }
          schedulePersist();
        },

        restreamFromId: (id) => {
          const { chains, layoutMode, viewMode } = get();
          const pos = findMessage(chains, id);
          if (!pos) return;
          set({
            visibleMessages: visibleBefore(chains, pos.ci, pos.mi, layoutMode),
            streamingMessage: chains[pos.ci].messages[pos.mi],
            streamedText: '',
            currentChainIndex: pos.ci,
            currentMessageIndex: pos.mi,
            isStreaming: true,
            viewMode: viewMode === 'overview' || viewMode === 'highlights' ? 'chat' : viewMode,
          });
          schedulePersist();
        },

        jumpToMessage: (id) => {
          const { chains, layoutMode, viewMode } = get();
          const pos = findMessage(chains, id);
          if (!pos) return;
          set({
            visibleMessages: visibleThrough(chains, pos.ci, pos.mi, layoutMode),
            streamingMessage: null,
            streamedText: '',
            currentChainIndex: pos.ci,
            currentMessageIndex: pos.mi,
            isStreaming: false,
            viewMode: viewMode === 'overview' || viewMode === 'highlights' ? 'chat' : viewMode,
          });
          schedulePersist();
        },

        fastForward: () => {
          const { chains, layoutMode, currentChainIndex } = get();
          if (chains.length === 0) return;
          const ci = layoutMode === 'paginated' ? currentChainIndex : chains.length - 1;
          const mi = (chains[ci]?.messages.length ?? 1) - 1;
          set({
            visibleMessages: visibleThrough(chains, ci, mi, layoutMode),
            streamingMessage: null,
            streamedText: '',
            currentChainIndex: ci,
            currentMessageIndex: mi,
            isStreaming: false,
          });
          schedulePersist();
        },

        nextPage: () => {
          const { chains, currentChainIndex, autoStream } = get();
          const target = currentChainIndex + 1;
          if (target >= chains.length) return;
          const chain = chains[target];
          if (autoStream) {
            set({
              visibleMessages: [],
              streamingMessage: chain.messages[0],
              streamedText: '',
              currentChainIndex: target,
              currentMessageIndex: 0,
              isStreaming: true,
            });
          } else {
            set({
              visibleMessages: chain.messages,
              streamingMessage: null,
              streamedText: '',
              currentChainIndex: target,
              currentMessageIndex: chain.messages.length - 1,
              isStreaming: false,
            });
          }
          schedulePersist();
        },

        prevPage: () => {
          const { chains, currentChainIndex, autoStream } = get();
          const target = currentChainIndex - 1;
          if (target < 0) return;
          const chain = chains[target];
          if (autoStream) {
            set({
              visibleMessages: [],
              streamingMessage: chain.messages[0],
              streamedText: '',
              currentChainIndex: target,
              currentMessageIndex: 0,
              isStreaming: true,
            });
          } else {
            set({
              visibleMessages: chain.messages,
              streamingMessage: null,
              streamedText: '',
              currentChainIndex: target,
              currentMessageIndex: chain.messages.length - 1,
              isStreaming: false,
            });
          }
          schedulePersist();
        },

        /* ----- chains ----- */

        reorderChains: (newChains) => {
          set({ chains: newChains });
          schedulePersist();
        },

        toggleStarChain: (chainId) => {
          set({
            chains: get().chains.map(c =>
              c.id === chainId ? { ...c, starred: !c.starred } : c,
            ),
          });
          schedulePersist();
        },

        updateStarSettings: (chainId, settings) => {
          set({
            chains: get().chains.map(c =>
              c.id === chainId ? { ...c, starSettings: { ...c.starSettings, ...settings } } : c,
            ),
          });
          schedulePersist();
        },

        /* ----- highlights ----- */

        addHighlight: (highlight) => {
          const { currentStory } = get();
          if (!currentStory) return;
          set({
            currentStory: {
              ...currentStory,
              highlights: [...(currentStory.highlights ?? []), highlight],
            },
          });
          schedulePersist();
        },

        removeHighlight: (id) => {
          const { currentStory } = get();
          if (!currentStory) return;
          set({
            currentStory: {
              ...currentStory,
              highlights: (currentStory.highlights ?? []).filter(h => h.id !== id),
            },
          });
          schedulePersist();
        },

        /* ----- view / settings ----- */

        setViewMode: (viewMode) => set({ viewMode }),

        setLayoutMode: (layoutMode) => {
          const { chains, currentChainIndex: ci, currentMessageIndex: mi, streamingMessage } = get();
          if (chains.length === 0) {
            set({ layoutMode });
            return;
          }
          if (streamingMessage) {
            set({ layoutMode, visibleMessages: visibleBefore(chains, ci, mi, layoutMode) });
          } else {
            set({ layoutMode, visibleMessages: visibleThrough(chains, ci, mi, layoutMode) });
          }
        },

        setTheme: (theme) => set({ theme }),
        setFontFamily: (fontFamily) => set({ fontFamily }),
        setFontSize: (fontSize) => set({ fontSize }),
        setTextColor: (textColor) => set({ textColor, theme: 'custom' }),
        setBgColor: (bgColor) => set({ bgColor, theme: 'custom' }),
        setAnimationStyle: (animationStyle) => set({ animationStyle }),
        setHideMetadata: (hideMetadata) => set({ hideMetadata }),
        setAutoStream: (autoStream) => set({ autoStream }),
        setAutoFormat: (autoFormat) => set({ autoFormat }),
        setStyleQuotes: (styleQuotes) => set({ styleQuotes }),
        setSubstituteNames: (substituteNames) => set({ substituteNames }),
        setParagraphSpacing: (paragraphSpacing) => set({ paragraphSpacing }),
        setDialogueOwnLine: (dialogueOwnLine) => set({ dialogueOwnLine }),
        setSmartTypography: (smartTypography) => set({ smartTypography }),
        setRevealMode: (revealMode) => set({ revealMode }),
        setMessagePause: (messagePause) => set({ messagePause }),
        setPauseAtPageEnd: (pauseAtPageEnd) => set({ pauseAtPageEnd }),
        setTtsEnabled: (ttsEnabled) => set({ ttsEnabled }),
        setTtsVoiceURI: (ttsVoiceURI) => set({ ttsVoiceURI }),
        setTtsRate: (ttsRate) => set({ ttsRate }),
        setTtsPending: (ttsPending) => set({ ttsPending }),
        setAwaitingAdvance: (awaitingAdvance) => set({ awaitingAdvance }),
        setSearchQuery: (searchQuery) => set({ searchQuery }),
        setIsAutofocusMode: (isAutofocusMode) =>
          set({ isAutofocusMode, autofocusZoom: 1, autofocusPanX: 0 }),
        setAutofocusZoom: (autofocusZoom) => set({ autofocusZoom }),
        setAutofocusPanX: (autofocusPanX) => set({ autofocusPanX }),
        setIsHighlightMode: (isHighlightMode) => set({ isHighlightMode }),
        setReverseStream: (reverseStream) => set({ reverseStream }),
        setControlsMinimized: (controlsMinimized) => set({ controlsMinimized }),
        setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

        setDialogueColor: (dialogueColor) => set({ dialogueColor }),
        setDialogueStyle: (dialogueStyle) => set({ dialogueStyle }),
        setDialogueAnimation: (dialogueAnimation) => set({ dialogueAnimation }),

        addAutoFormatRule: (rule) =>
          set({ autoFormatRules: [...get().autoFormatRules, rule] }),
        updateAutoFormatRule: (id, updates) =>
          set({
            autoFormatRules: get().autoFormatRules.map(r =>
              r.id === id ? { ...r, ...updates } : r,
            ),
          }),
        removeAutoFormatRule: (id) =>
          set({ autoFormatRules: get().autoFormatRules.filter(r => r.id !== id) }),
        moveAutoFormatRule: (id, direction) => {
          const rules = [...get().autoFormatRules];
          const idx = rules.findIndex(r => r.id === id);
          const target = idx + direction;
          if (idx === -1 || target < 0 || target >= rules.length) return;
          [rules[idx], rules[target]] = [rules[target], rules[idx]];
          set({ autoFormatRules: rules });
        },
        importAutoFormatRules: (rules) => {
          const existing = new Set(get().autoFormatRules.map(r => r.id));
          const incoming = rules.map(r => ({
            ...r,
            id: existing.has(r.id) ? newId() : r.id,
          }));
          set({ autoFormatRules: [...get().autoFormatRules, ...incoming] });
        },

        saveConfig: (name) =>
          set({ savedConfigs: { ...get().savedConfigs, [name]: pickConfig(get()) } }),
        loadConfig: (name) => {
          const config = get().savedConfigs[name];
          if (config) set({ ...config });
        },
        deleteConfig: (name) => {
          const configs = { ...get().savedConfigs };
          delete configs[name];
          set({ savedConfigs: configs });
        },
      };
    },
    {
      name: 'aura-reader-settings',
      partialize: (state) => ({
        ...pickConfig(state),
        savedConfigs: state.savedConfigs,
        viewMode: state.viewMode === 'overview' || state.viewMode === 'highlights'
          ? 'chat'
          : state.viewMode,
        layoutMode: state.layoutMode,
        controlsMinimized: state.controlsMinimized,
      }),
    },
  ),
);
