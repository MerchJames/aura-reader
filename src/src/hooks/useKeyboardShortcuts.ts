import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';

const isTyping = (e: KeyboardEvent) =>
  e.target instanceof HTMLInputElement ||
  e.target instanceof HTMLTextAreaElement ||
  e.target instanceof HTMLSelectElement;

/**
 * Global shortcuts. Listeners are registered once; state is read through
 * useAppStore.getState() so the handlers never go stale.
 *
 *   Space        play / pause
 *   ← / →        previous / next page (paginated layout)
 *   Q tap        slower   |  Q hold: rewind while held
 *   E tap        faster   |  E hold: 3x boost while held
 *   F hold       (autofocus) highlight selection on release
 *   Escape       exit autofocus / close settings
 */
export const useKeyboardShortcuts = () => {
  const heldQ = useRef(false);
  const heldE = useRef(false);
  const qHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qDidHold = useRef(false);
  const eDidHold = useRef(false);
  const speedBeforeBoost = useRef<number | null>(null);
  const heldF = useRef(false);

  useEffect(() => {
    const HOLD_MS = 300;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const s = useAppStore.getState();

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          s.setIsStreaming(!s.isStreaming);
          break;

        case 'f':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            document.getElementById('search-input')?.focus();
          } else if (s.screen === 'reader' && !heldF.current) {
            // Hold F to enter highlight mode; ReaderDisplay pauses streaming so a
            // selection can hold, and captures it when F is released.
            heldF.current = true;
            s.setIsHighlightMode(true);
          }
          break;

        case 'arrowright':
          if (s.layoutMode === 'paginated' && s.screen === 'reader') s.nextPage();
          break;

        case 'arrowleft':
          if (s.layoutMode === 'paginated' && s.screen === 'reader') s.prevPage();
          break;

        case 'q':
          if (heldQ.current) break;
          heldQ.current = true;
          qDidHold.current = false;
          qHoldTimer.current = setTimeout(() => {
            qDidHold.current = true;
            useAppStore.getState().setReverseStream(true);
          }, HOLD_MS);
          break;

        case 'e':
          if (heldE.current) break;
          heldE.current = true;
          eDidHold.current = false;
          eHoldTimer.current = setTimeout(() => {
            eDidHold.current = true;
            const st = useAppStore.getState();
            speedBeforeBoost.current = st.playbackSpeed;
            st.setPlaybackSpeed(Math.min(100, st.playbackSpeed * 3));
          }, HOLD_MS);
          break;

        case 'escape':
          if (s.settingsOpen) s.setSettingsOpen(false);
          else if (s.isAutofocusMode) s.setIsAutofocusMode(false);
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const s = useAppStore.getState();

      switch (e.key.toLowerCase()) {
        case 'f':
          if (heldF.current) {
            heldF.current = false;
            // ReaderDisplay watches this transition and captures the current
            // selection (with the right message id) as a highlight.
            s.setIsHighlightMode(false);
          }
          break;

        case 'q':
          if (!heldQ.current) break;
          heldQ.current = false;
          if (qHoldTimer.current) clearTimeout(qHoldTimer.current);
          if (qDidHold.current) {
            s.setReverseStream(false);
          } else {
            s.setPlaybackSpeed(Math.max(1, s.playbackSpeed - 10));
          }
          break;

        case 'e':
          if (!heldE.current) break;
          heldE.current = false;
          if (eHoldTimer.current) clearTimeout(eHoldTimer.current);
          if (eDidHold.current && speedBeforeBoost.current !== null) {
            s.setPlaybackSpeed(speedBeforeBoost.current);
            speedBeforeBoost.current = null;
          } else if (!eDidHold.current) {
            s.setPlaybackSpeed(Math.min(100, s.playbackSpeed + 10));
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (qHoldTimer.current) clearTimeout(qHoldTimer.current);
      if (eHoldTimer.current) clearTimeout(eHoldTimer.current);
    };
  }, []);
};
