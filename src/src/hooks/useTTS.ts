import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { plainTextForSpeech, processText } from '../utils/textProcessor';

export const ttsSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

/**
 * Effective voice rate. When "follow speed" is on, the 1–100 reading-speed
 * slider scales the voice so a faster stream reads faster (capped at the
 * browser's practical ceiling).
 */
export const ttsEffectiveRate = (
  ttsRate: number, playbackSpeed: number, followSpeed: boolean,
): number => {
  if (!followSpeed) return ttsRate;
  const factor = 0.6 + playbackSpeed * 0.028; // speed 50 ≈ 2×, speed 100 ≈ 3.4×
  return Math.min(4, Math.max(0.5, ttsRate * factor));
};

/** Available voices; updates when the browser finishes loading them. */
export const useVoices = (): SpeechSynthesisVoice[] => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!ttsSupported()) return;
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
};

/**
 * Reads the streaming message aloud via the Web Speech API. Message
 * advancement waits for speech to finish (the streamer sets
 * `awaitingAdvance` when the visual reveal completes first).
 */
export const useTTS = () => {
  const enabled = useAppStore(s => s.ttsEnabled);
  const messageId = useAppStore(s => s.streamingMessage?.id);
  const isStreaming = useAppStore(s => s.isStreaming);

  // One utterance per streaming message.
  useEffect(() => {
    if (!enabled || !messageId || !ttsSupported()) return;
    const s = useAppStore.getState();
    const msg = s.streamingMessage;
    if (!msg || !s.isStreaming) return;

    const { processedText } = processText(msg.content, {
      hideMetadata: s.hideMetadata,
      substituteNames: s.substituteNames,
      characterName: s.currentStory?.characterName,
      userName: s.currentStory?.userName,
      role: msg.role,
    });
    const plain = plainTextForSpeech(processedText);
    if (!plain) return;

    const utterance = new SpeechSynthesisUtterance(plain);
    const voice = speechSynthesis.getVoices().find(v => v.voiceURI === s.ttsVoiceURI);
    if (voice) utterance.voice = voice;
    utterance.rate = ttsEffectiveRate(s.ttsRate, s.playbackSpeed, s.ttsFollowSpeed);
    utterance.pitch = s.ttsPitch;

    const finish = () => {
      const st = useAppStore.getState();
      st.setTtsPending(false);
      if (st.awaitingAdvance) {
        st.setAwaitingAdvance(false);
        if (st.isStreaming && st.streamingMessage?.id === messageId) {
          st.advanceMessage();
        }
      }
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    s.setTtsPending(true);
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);

    return () => {
      speechSynthesis.cancel();
      useAppStore.getState().setTtsPending(false);
    };
  }, [enabled, messageId]);

  // Pause/resume speech together with playback.
  useEffect(() => {
    if (!enabled || !ttsSupported()) return;
    if (isStreaming) speechSynthesis.resume();
    else speechSynthesis.pause();
  }, [enabled, isStreaming]);

  // Full stop when TTS is switched off.
  useEffect(() => {
    if (!enabled && ttsSupported()) {
      speechSynthesis.cancel();
      useAppStore.getState().setTtsPending(false);
    }
  }, [enabled]);
};
