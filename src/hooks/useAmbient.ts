import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { AmbientController } from '../utils/ambient';

/**
 * Loops the ambient bed assigned to the current theme while the reader is
 * open. Beds are per-theme, so switching themes swaps the atmosphere.
 */
export const useAmbient = () => {
  const enabled = useAppStore(s => s.ambientEnabled);
  const volume = useAppStore(s => s.ambientVolume);
  const spec = useAppStore(s => s.ambientByTheme[s.theme] ?? '');
  const screen = useAppStore(s => s.screen);
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

  useEffect(() => { ctlRef.current?.setVolume(volume); }, [volume]);

  useEffect(() => () => ctlRef.current?.dispose(), []);
};
