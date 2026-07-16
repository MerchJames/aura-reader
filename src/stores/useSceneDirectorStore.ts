import { create } from 'zustand';

/**
 * Ephemeral runtime state for a Scene Director enrichment run — progress for
 * the status readout + a "busy" flag so only one run happens at a time. Not
 * persisted (the descriptors themselves live in useAuraV2Store.sceneByStory).
 * The actual run is driven by utils/sceneDirectorRunner.
 */
interface SceneDirectorState {
  running: boolean;
  /** Story the current run belongs to. */
  storyId: string | null;
  /** Unique passages read so far this run. */
  done: number;
  /** Passages requested this run. */
  total: number;
  begin: (storyId: string, total: number) => void;
  advance: (done: number) => void;
  end: () => void;
}

export const useSceneDirectorStore = create<SceneDirectorState>((set) => ({
  running: false,
  storyId: null,
  done: 0,
  total: 0,
  begin: (storyId, total) => set({ running: true, storyId, done: 0, total }),
  advance: (done) => set({ done }),
  end: () => set({ running: false }),
}));
