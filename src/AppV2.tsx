import React, { lazy, Suspense, useEffect } from 'react';
import App from './App';
import { CodexSidebar } from './components/CodexSidebar';
import { PinDock } from './components/PinDock';
import { SheetsSidebar } from './components/SheetsSidebar';
import { RecapCard } from './components/RecapCard';
import { useCodexExtractor } from './hooks/useCodexExtractor';
import { useAppStore } from './store';
import { useAuraV2Store } from './stores/useAuraV2Store';

// React Flow (and its stylesheet) only load when the multiverse is opened —
// the default reading experience ships none of its weight.
const MultiverseExplorer = lazy(() =>
  import('./components/MultiverseExplorer').then(m => ({ default: m.MultiverseExplorer })));

/** Accumulate per-story reading time while text is actually streaming. */
const useReadingClock = () => {
  const active = useAppStore(s => s.isStreaming && s.screen === 'reader');
  useEffect(() => {
    if (!active) return;
    const TICK = 5000;
    const id = setInterval(() => {
      const storyId = useAppStore.getState().currentStory?.id;
      if (storyId) useAuraV2Store.getState().addReadingTime(storyId, TICK);
    }, TICK);
    return () => clearInterval(id);
  }, [active]);
};

/**
 * v2 shell: the classic reader stays exactly as it was; the Codex, the
 * Multiverse, and the resume recap layer on top as overlays. All of them
 * are hidden until summoned, keeping the default experience pure reading.
 */
export default function AppV2() {
  useCodexExtractor();
  useReadingClock();

  const multiverseOpen = useAuraV2Store(s => s.multiverseOpen);
  const screen = useAppStore(s => s.screen);

  // Leaving the reader closes the overlays with it.
  useEffect(() => {
    if (screen !== 'reader') {
      const v2 = useAuraV2Store.getState();
      if (v2.multiverseOpen) v2.setMultiverseOpen(false);
      if (v2.codexOpen) v2.setCodexOpen(false);
      if (v2.sheetsOpen) v2.setSheetsOpen(false);
    }
  }, [screen]);

  return (
    <>
      <App />
      {screen === 'reader' && (
        <>
          <CodexSidebar />
          <SheetsSidebar />
          <PinDock />
          <RecapCard />
          {multiverseOpen && (
            <Suspense fallback={null}>
              <MultiverseExplorer />
            </Suspense>
          )}
        </>
      )}
    </>
  );
}
