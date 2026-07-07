import { useEffect } from 'react';
import { useAppStore } from '../store';
import { processText } from '../utils/textProcessor';

/** Characters revealed per second for a 1-100 speed setting. */
export const charsPerSecond = (speed: number) => 8 + speed * 2.2;

/** Words revealed per second for a 1-100 speed setting (~50 ≈ 350 wpm). */
export const wordsPerSecond = (speed: number) => 0.8 + speed * 0.1;

const nextWordEnd = (text: string, from: number): number => {
  let i = from;
  while (i < text.length && /\s/.test(text[i])) i++;
  while (i < text.length && !/\s/.test(text[i])) i++;
  return i;
};

/**
 * Drives the reveal animation. One rAF loop per streaming message —
 * progress is tracked with a time accumulator instead of restarting the
 * loop on every store update.
 */
export const useStreamer = () => {
  const isStreaming = useAppStore(s => s.isStreaming);
  const reverseStream = useAppStore(s => s.reverseStream);
  const messageId = useAppStore(s => s.streamingMessage?.id);

  useEffect(() => {
    if (!isStreaming && !reverseStream) return;
    if (!messageId) {
      // Nothing left to stream.
      if (isStreaming) useAppStore.getState().setIsStreaming(false);
      return;
    }

    let raf = 0;
    let pauseTimer: ReturnType<typeof setTimeout> | null = null;
    let last = performance.now();
    let acc = 0;
    let cachedFullText: string | null = null;
    let cachedKey = '';

    const fullText = () => {
      const s = useAppStore.getState();
      const msg = s.streamingMessage;
      if (!msg) return '';
      const key = [
        msg.id, s.hideMetadata, s.autoFormat, s.styleQuotes, s.substituteNames,
        s.paragraphSpacing, s.dialogueOwnLine, s.smartTypography,
        JSON.stringify(s.autoFormatRules),
      ].join('|');
      if (cachedFullText === null || key !== cachedKey) {
        cachedFullText = processText(msg.content, {
          hideMetadata: s.hideMetadata,
          autoFormat: s.autoFormat,
          autoFormatRules: s.autoFormatRules,
          paragraphSpacing: s.paragraphSpacing,
          dialogueOwnLine: s.dialogueOwnLine,
          smartTypography: s.smartTypography,
          styleQuotes: s.styleQuotes,
          substituteNames: s.substituteNames,
          characterName: s.currentStory?.characterName,
          userName: s.currentStory?.userName,
          role: msg.role,
        }).processedText;
        cachedKey = key;
      }
      return cachedFullText;
    };

    const scheduleAdvance = () => {
      const s = useAppStore.getState();
      s.finishCurrentMessage();
      pauseTimer = setTimeout(() => {
        const st = useAppStore.getState();
        if (!st.isStreaming || st.streamingMessage?.id !== messageId) return;
        if (st.ttsEnabled && st.ttsPending) {
          // Voice is still reading this message — the TTS hook advances on end.
          st.setAwaitingAdvance(true);
          return;
        }
        st.advanceMessage();
      }, Math.max(0, s.messagePause));
    };

    const tick = (now: number) => {
      const s = useAppStore.getState();
      const dt = Math.min(now - last, 250); // clamp away tab-switch jumps
      last = now;

      if (s.reverseStream) {
        acc += (dt / 1000) * charsPerSecond(s.playbackSpeed) * 2;
        const remove = Math.floor(acc);
        if (remove >= 1 && s.streamedText.length > 0) {
          acc -= remove;
          s.updateStreamedText(s.streamedText.slice(0, Math.max(0, s.streamedText.length - remove)));
        }
        raf = requestAnimationFrame(tick);
        return;
      }

      if (!s.isStreaming || !s.streamingMessage) return;

      const chain = s.chains[s.currentChainIndex];
      const speed = (chain?.starred && chain.starSettings?.speed) || s.playbackSpeed;
      const full = fullText();

      if (s.streamedText.length >= full.length) {
        scheduleAdvance();
        return; // effect re-runs for the next message
      }

      if (s.revealMode === 'word') {
        acc += (dt / 1000) * wordsPerSecond(speed);
        const words = Math.floor(acc);
        if (words >= 1) {
          acc -= words;
          let end = s.streamedText.length;
          for (let w = 0; w < words; w++) end = nextWordEnd(full, end);
          s.updateStreamedText(full.slice(0, end));
        }
      } else {
        acc += (dt / 1000) * charsPerSecond(speed);
        const reveal = Math.floor(acc);
        if (reveal >= 1) {
          acc -= reveal;
          s.updateStreamedText(full.slice(0, s.streamedText.length + reveal));
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (pauseTimer) clearTimeout(pauseTimer);
    };
  }, [isStreaming, reverseStream, messageId]);
};
