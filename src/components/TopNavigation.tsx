import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, BookMarked, BookOpen, Bot, Focus, GitBranch, Highlighter, List, MessageSquare,
  Network, Pencil, Search, Settings, Table2, X,
} from 'lucide-react';
import { useAppStore } from '../store';
import { useAuraV2Store, committedCount, flatMessages } from '../stores/useAuraV2Store';
import { wordsPerSecond } from '../hooks/useStreamer';
import { ViewMode } from '../types';
import { cn } from '../utils/cn';
import { resolveContent } from '../utils/lens';

const VIEW_BUTTONS: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
  { mode: 'storybook', icon: <BookOpen size={18} />, label: 'Storybook' },
  { mode: 'chat', icon: <MessageSquare size={18} />, label: 'Chat' },
  { mode: 'branches', icon: <GitBranch size={18} />, label: 'Branches' },
  { mode: 'overview', icon: <List size={18} />, label: 'Overview' },
  { mode: 'highlights', icon: <Highlighter size={18} />, label: 'Highlights' },
];

export const TopNavigation = () => {
  const currentStory = useAppStore(s => s.currentStory);
  const viewMode = useAppStore(s => s.viewMode);
  const setViewMode = useAppStore(s => s.setViewMode);
  const searchQuery = useAppStore(s => s.searchQuery);
  const setSearchQuery = useAppStore(s => s.setSearchQuery);
  const isAutofocusMode = useAppStore(s => s.isAutofocusMode);
  const setIsAutofocusMode = useAppStore(s => s.setIsAutofocusMode);
  const setSettingsOpen = useAppStore(s => s.setSettingsOpen);
  const aiOpen = useAppStore(s => s.aiOpen);
  const setAiOpen = useAppStore(s => s.setAiOpen);
  const closeStory = useAppStore(s => s.closeStory);
  const codexOpen = useAuraV2Store(s => s.codexOpen);
  const setCodexOpen = useAuraV2Store(s => s.setCodexOpen);
  const sheetsOpen = useAuraV2Store(s => s.sheetsOpen);
  const setSheetsOpen = useAuraV2Store(s => s.setSheetsOpen);
  const setMultiverseOpen = useAuraV2Store(s => s.setMultiverseOpen);
  const overridesByStory = useAuraV2Store(s => s.overridesByStory);
  const lensOnByStory = useAuraV2Store(s => s.lensOnByStory);
  const setLensOn = useAuraV2Store(s => s.setLensOn);
  const removeOverride = useAuraV2Store(s => s.removeOverride);
  const lensManagerOpen = useAuraV2Store(s => s.lensManagerOpen);
  const setLensManagerOpen = useAuraV2Store(s => s.setLensManagerOpen);

  const storyId = currentStory?.id;
  const overrides = storyId ? overridesByStory[storyId] ?? [] : [];
  const lensOn = !!storyId && !!lensOnByStory[storyId];
  const hasOverrides = overrides.length > 0;
  const managerRef = useRef<HTMLDivElement>(null);

  // Close the lens manager when clicking outside it.
  useEffect(() => {
    if (!lensManagerOpen) return;
    const handler = (e: MouseEvent) => {
      if (managerRef.current && !managerRef.current.contains(e.target as Node)) {
        setLensManagerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [lensManagerOpen, setLensManagerOpen]);

  // Kindle-style "time left in story", from position and reading speed.
  const chains = useAppStore(s => s.chains);
  const currentChainIndex = useAppStore(s => s.currentChainIndex);
  const currentMessageIndex = useAppStore(s => s.currentMessageIndex);
  const streaming = useAppStore(s => !!s.streamingMessage);
  const playbackSpeed = useAppStore(s => s.playbackSpeed);
  const cumWords = useMemo(() => {
    const msgs = flatMessages(chains);
    const cum = new Array<number>(msgs.length + 1);
    cum[0] = 0;
    msgs.forEach((m, i) => {
      const text = resolveContent(m, overrides, lensOn);
      cum[i + 1] = cum[i] + text.split(/\s+/).length;
    });
    return cum;
  }, [chains, overrides, lensOn]);
  const minutesLeft = useMemo(() => {
    if (cumWords.length <= 1) return 0;
    const read = Math.min(
      committedCount(chains, currentChainIndex, currentMessageIndex, streaming),
      cumWords.length - 1,
    );
    const remaining = cumWords[cumWords.length - 1] - cumWords[Math.max(0, read)];
    return Math.round(remaining / (wordsPerSecond(playbackSpeed) * 60));
  }, [cumWords, chains, currentChainIndex, currentMessageIndex, streaming, playbackSpeed]);

  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4 py-3 border-b border-app-border bg-surface/85 backdrop-blur-md">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => closeStory()}
          title="Back to library"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm hover:bg-app-text/5 transition-colors shrink-0"
        >
          <ArrowLeft size={17} />
          <span className="hidden sm:inline">Library</span>
        </button>
        {currentStory && (
          <div className="min-w-0 hidden md:block">
            <h1 className="font-bold truncate leading-tight">{currentStory.title}</h1>
            <p className="text-[11px] text-muted leading-tight">
              {currentStory.messageCount} messages
              {minutesLeft > 0 && ` · ~${minutesLeft} min left`}
            </p>
          </div>
        )}
      </div>

      <div className="flex bg-app-text/5 p-1 rounded-lg shrink-0">
        {VIEW_BUTTONS.map(({ mode, icon, label }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            title={label}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              viewMode === mode
                ? 'bg-surface shadow-sm text-accent'
                : 'opacity-50 hover:opacity-100',
            )}
          >
            {icon}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" size={14} />
          <input
            id="search-input"
            type="text"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm bg-app-text/5 border border-transparent rounded-full focus:outline-none focus:border-accent/50 w-40 focus:w-52 transition-all"
          />
        </div>
        <button
          onClick={() => setMultiverseOpen(true)}
          title="Multiverse — story map & timelines (M)"
          className="p-2 rounded-lg opacity-60 hover:opacity-100 hover:bg-app-text/5 transition-colors"
        >
          <Network size={18} />
        </button>
        <button
          onClick={() => setCodexOpen(!codexOpen)}
          title="Codex — everything you've met so far (C)"
          className={cn(
            'p-2 rounded-lg transition-colors',
            codexOpen
              ? 'bg-accent/20 text-accent'
              : 'opacity-60 hover:opacity-100 hover:bg-app-text/5',
          )}
        >
          <BookMarked size={18} />
        </button>
        <button
          onClick={() => setSheetsOpen(!sheetsOpen)}
          title="Sheets — pinnable tables (S)"
          className={cn(
            'p-2 rounded-lg transition-colors',
            sheetsOpen
              ? 'bg-accent/20 text-accent'
              : 'opacity-60 hover:opacity-100 hover:bg-app-text/5',
          )}
        >
          <Table2 size={18} />
        </button>
        {hasOverrides && storyId && (
          <div className="relative" ref={managerRef}>
            <button
              onClick={() => setLensManagerOpen(!lensManagerOpen)}
              title={`Lens — ${lensOn ? 'edits visible' : 'edits hidden'} (${overrides.length})`}
              className={cn(
                'p-2 rounded-lg transition-colors',
                lensOn || lensManagerOpen
                  ? 'bg-amber-500/20 text-amber-500'
                  : 'opacity-60 hover:opacity-100 hover:bg-app-text/5',
              )}
            >
              <Pencil size={18} />
            </button>
            {lensManagerOpen && (
              <LensManagerPopover
                storyId={storyId}
                overrides={overrides}
                lensOn={lensOn}
                onClose={() => setLensManagerOpen(false)}
              />
            )}
          </div>
        )}
        <button
          onClick={() => setAiOpen(!aiOpen)}
          title="Reading assistant (AI)"
          className={cn(
            'p-2 rounded-lg transition-colors',
            aiOpen
              ? 'bg-accent/20 text-accent'
              : 'opacity-60 hover:opacity-100 hover:bg-app-text/5',
          )}
        >
          <Bot size={18} />
        </button>
        <button
          onClick={() => setIsAutofocusMode(!isAutofocusMode)}
          title="Autofocus handsfree mode"
          className={cn(
            'p-2 rounded-lg transition-colors',
            isAutofocusMode
              ? 'bg-amber-500/20 text-amber-500'
              : 'opacity-60 hover:opacity-100 hover:bg-app-text/5',
          )}
        >
          <Focus size={18} />
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="p-2 rounded-lg opacity-60 hover:opacity-100 hover:bg-app-text/5 transition-colors"
        >
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
};

interface LensManagerPopoverProps {
  storyId: string;
  overrides: import('../types').MessageOverride[];
  lensOn: boolean;
  onClose: () => void;
}

const LensManagerPopover = ({ storyId, overrides, lensOn, onClose }: LensManagerPopoverProps) => {
  const setLensOn = useAuraV2Store(s => s.setLensOn);
  const removeOverride = useAuraV2Store(s => s.removeOverride);
  const clearOverrides = useAuraV2Store(s => s.clearOverrides);
  const jumpToMessage = useAppStore(s => s.jumpToMessage);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="absolute right-0 top-full mt-2 w-72 max-h-[70vh] overflow-y-auto rounded-xl bg-surface border border-app-border shadow-2xl p-3 z-50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold">Lens edits</span>
        <button onClick={onClose} className="p-1 opacity-50 hover:opacity-100"><X size={14} /></button>
      </div>
      <label className="flex items-center gap-2 mb-3 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={lensOn}
          onChange={(e) => setLensOn(storyId, e.target.checked)}
          className="accent-amber-500"
        />
        Show edits in reader
      </label>
      {overrides.length === 0 ? (
        <p className="text-xs opacity-50">No edits yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {overrides.slice().reverse().map(o => (
            <div key={`${o.messageId}-${o.kind}`} className="text-xs border border-app-border/50 rounded-lg p-2">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={cn(
                  'px-1 py-0.5 rounded font-medium',
                  o.kind === 'rewrite' ? 'bg-violet-500/15 text-violet-400' : 'bg-emerald-500/15 text-emerald-400',
                )}>
                  {o.kind}
                </span>
                <span className="opacity-50">{new Date(o.createdAt).toLocaleDateString()}</span>
                <button
                  onClick={() => removeOverride(storyId, o.messageId, o.kind)}
                  className="ml-auto text-rose-400 hover:text-rose-300"
                >
                  Revert
                </button>
              </div>
              {o.note && <p className="opacity-70 mb-1 italic">{o.note}</p>}
              <p className="opacity-90 line-clamp-3">{o.content.slice(0, 180)}{o.content.length > 180 ? '…' : ''}</p>
              <button
                onClick={() => { jumpToMessage(o.messageId); onClose(); }}
                className="mt-1.5 text-accent hover:underline"
              >
                Jump to message
              </button>
            </div>
          ))}
          {confirmClear ? (
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => { clearOverrides(storyId); setConfirmClear(false); }}
                className="flex-1 py-1.5 rounded-lg bg-rose-500/20 text-rose-400 text-xs font-medium hover:bg-rose-500/30"
              >
                Confirm clear all
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="flex-1 py-1.5 rounded-lg bg-app-text/10 text-xs hover:bg-app-text/20"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="mt-1 py-1.5 rounded-lg bg-app-text/10 text-xs hover:bg-app-text/20"
            >
              Clear all edits
            </button>
          )}
        </div>
      )}
    </div>
  );
};
