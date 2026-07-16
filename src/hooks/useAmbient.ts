import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { useAuraV2Store } from '../stores/useAuraV2Store';
import { AmbientController } from '../utils/ambient';
import { sceneAmbientSpec, tensionVolume } from '../utils/sceneMood';

/**
 * Loops an ambient bed while the reader is open. By default the bed is per
 * theme; when the Scene Director's soundscapes are on and it has read the
 * passage in focus, the bed follows that scene's mood/location instead and the
 * volume tracks its tension. Un-read passages fall back to the theme bed.
 */
export const useAmbient = () => {
  const enabled = useAppStore(s => s.ambientEnabled);
  const volume = useAppStore(s => s.ambientVolume);
  const themeSpec = useAppStore(s => s.ambientByTheme[s.theme] ?? '');
  const screen = useAppStore(s => s.screen);
  const soundscapes = useAppStore(s => s.sceneSoundscapes);
  const storyId = useAppStore(s => s.currentStory?.id);
  const activeId = useAppStore(s =>
    s.streamingMessage?.id ?? s.visibleMessages[s.visibleMessages.length - 1]?.id);
  const descriptor = useAuraV2Store(s =>
    (soundscapes && storyId && activeId ? s.sceneByStory[storyId]?.[activeId] : undefined));

  // A read scene drives the bed (mood/location) + volume (tension); otherwise
  // the theme bed at the plain volume.
  const useScene = soundscapes && !!descriptor;
  const spec = useScene ? sceneAmbientSpec(descriptor!.mood, descriptor!.location) : themeSpec;
  const effVolume = useScene ? tensionVolume(volume, descriptor!.tension) : volume;

  const ctlRef = useRef<AmbientController | null>(null);
  if (!ctlRef.current) ctlRef.current = new AmbientController();

  // Browsers block audio until the user interacts — resume on first gesture.
  useEffect(() => {
    const resume = () => ctlRef.current?.resume();
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    };
  }, []);

  useEffect(() => {
    const ctl = ctlRef.current!;
    if (enabled && screen === 'reader' && spec) ctl.play(spec);
    else ctl.stop();
  }, [enabled, screen, spec]);

  useEffect(() => { ctlRef.current?.setVolume(effVolume); }, [effVolume]);

  useEffect(() => () => ctlRef.current?.dispose(), []);
};
