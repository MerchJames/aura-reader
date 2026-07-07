import React, { useEffect, useState } from 'react';
import { TopNavigation } from './components/TopNavigation';
import { PlaybackControls } from './components/PlaybackControls';
import { ReaderDisplay } from './components/ReaderDisplay';
import { OverviewMode } from './components/OverviewMode';
import { HighlightsMode } from './components/HighlightsMode';
import { AutoFormatModal } from './components/AutoFormatModal';
import { SettingsPanel } from './components/SettingsPanel';
import { Library } from './components/Library';
import { useStreamer } from './hooks/useStreamer';
import { useTTS } from './hooks/useTTS';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAppStore } from './store';
import { resolveTheme } from './themes';
import { cn } from './utils/cn';

const FONT_CLASS: Record<string, string> = {
  sans: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
  handwriting: 'font-handwriting',
  typewriter: 'font-typewriter',
  dyslexic: 'font-dyslexic',
};

export default function App() {
  useStreamer();
  useTTS();
  useKeyboardShortcuts();

  const screen = useAppStore(s => s.screen);
  const viewMode = useAppStore(s => s.viewMode);
  const theme = useAppStore(s => s.theme);
  const bgColor = useAppStore(s => s.bgColor);
  const textColor = useAppStore(s => s.textColor);
  const fontFamily = useAppStore(s => s.fontFamily);
  const initLibrary = useAppStore(s => s.initLibrary);
  const [showAutoFormat, setShowAutoFormat] = useState(false);

  useEffect(() => {
    void initLibrary();
  }, [initLibrary]);

  const themeDef = resolveTheme(theme, bgColor, textColor);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', themeDef.isDark);
    root.style.setProperty('--app-bg', themeDef.vars.bg);
    root.style.setProperty('--app-surface', themeDef.vars.surface);
    root.style.setProperty('--app-text', themeDef.vars.text);
    root.style.setProperty('--app-muted', themeDef.vars.muted);
    root.style.setProperty('--app-accent', themeDef.vars.accent);
    root.style.setProperty('--app-border', themeDef.vars.border);
    root.style.setProperty('--bubble-ai', themeDef.vars.bubbleAi);
    root.style.setProperty('--bubble-user', themeDef.vars.bubbleUser);
    root.style.setProperty('--bubble-user-text', themeDef.vars.bubbleUserText);
  }, [themeDef]);

  const effectiveFont = themeDef.font ?? fontFamily;

  return (
    <div
      className={cn(
        'min-h-screen flex flex-col bg-app-bg text-app-text transition-colors duration-500',
        FONT_CLASS[effectiveFont] ?? 'font-sans',
        themeDef.rootClass,
      )}
    >
      {screen === 'library' ? (
        <Library />
      ) : (
        <>
          <TopNavigation />
          {viewMode === 'overview' ? (
            <OverviewMode />
          ) : viewMode === 'highlights' ? (
            <HighlightsMode />
          ) : (
            <ReaderDisplay />
          )}
          <PlaybackControls />
        </>
      )}

      <SettingsPanel onOpenAutoFormat={() => setShowAutoFormat(true)} />
      {showAutoFormat && <AutoFormatModal onClose={() => setShowAutoFormat(false)} />}
    </div>
  );
}
