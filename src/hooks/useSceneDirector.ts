import { useEffect } from 'react';
import { useAppStore } from '../store';
import { useAuraV2Store } from '../stores/useAuraV2Store';
import { enrichCurrentPage, stopEnrich } from '../utils/sceneDirectorRunner';

/**
 * The hybrid half of the Scene Director: while it's enabled for the open story
 * and an AI endpoint is set, auto-enrich the page/chapter the reader is on
 * (the rest waits for a manual "Enrich all"). Debounced so flipping pages or
 * scrolling doesn't fire a burst of runs. Mounted once, in the reader.
 */
export const useSceneDirector = (): void => {
  const storyId = useAppStore(s => s.currentStory?.id);
  const chainIndex = useAppStore(s => s.currentChainIndex);
  const aiReady = useAppStore(s => !!s.aiBaseUrl && !!s.aiModel);
  const enabled = useAuraV2Store(s => (storyId ? !!s.directorEnabledByStory[storyId] : false));

  useEffect(() => {
    if (!storyId || !enabled || !aiReady) return;
    const t = setTimeout(() => { void enrichCurrentPage(storyId); }, 600);
    return () => clearTimeout(t);
  }, [storyId, chainIndex, enabled, aiReady]);

  // Stop an in-flight run when the story closes or the Director is turned off.
  useEffect(() => {
    if (!storyId || !enabled) stopEnrich();
    return () => stopEnrich();
  }, [storyId, enabled]);
};
