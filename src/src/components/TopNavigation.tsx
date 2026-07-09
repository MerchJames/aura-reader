import React from 'react';
import {
  ArrowLeft, BookOpen, Bot, Focus, GitBranch, Highlighter, List, MessageSquare, Search, Settings,
} from 'lucide-react';
import { useAppStore } from '../store';
import { ViewMode } from '../types';
import { cn } from '../utils/cn';

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
