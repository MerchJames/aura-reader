import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { useAuraV2Store } from '../stores/useAuraV2Store';
import { plainTextForSpeech, processText } from '../utils/textProcessor';
import { resolveContent } from '../utils/lens';
import { kokoroSpeak, voiceForSpeaker } from '../utils/kokoro';

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
  const engine = useAppStore(s => s.ttsEngine);
  const messageId = useAppStore(s => s.streamingMessage?.id);
  const isStreaming = useAppStore(s => s.isStreaming);

  // Kokoro playback lives outside React so we can pause/cancel it precisely.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  const stopKokoro = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
  };

  // One utterance/clip per streaming message.
  useEffect(() => {
    if (!enabled || !messageId) return;
    const s = useAppStore.getState();
    const msg = s.streamingMessage;
    if (!msg || !s.isStreaming) return;

    const storyId = s.currentStory?.id;
    const v2 = useAuraV2Store.getState();
    const content = resolveContent(
      msg,
      storyId ? v2.overridesByStory[storyId] : undefined,
      !!storyId && !!v2.lensOnByStory[storyId],
    );

    const { processedText } = processText(content, {
      hideMetadata: s.hideMetadata,
      substituteNames: s.substituteNames,
      characterName: s.currentStory?.characterName,
      userName: s.currentStory?.userName,
      role: msg.role,
    });
    const plain = plainTextForSpeech(processedText);
    if (!plain) return;

    const rate = ttsEffectiveRate(s.ttsRate, s.playbackSpeed, s.ttsFollowSpeed);
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

    // --- Kokoro engine: fetch synthesized audio, per-character voice. ---
    if (engine === 'kokoro') {
      const controller = new AbortController();
      abortRef.current = controller;
      const voice = voiceForSpeaker({
        role: msg.role,
        name: msg.name,
        kokoroVoice: s.kokoroVoice,
        kokoroUserVoice: s.kokoroUserVoice,
        ttsVoiceByCharacter: s.ttsVoiceByCharacter,
      });
      s.setTtsPending(true);
      kokoroSpeak(s.kokoroBaseUrl, s.kokoroApiKey, voice, plain, rate, controller.signal)
        .then(blob => {
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          const audio = audioRef.current ?? new Audio();
          audioRef.current = audio;
          audio.src = url;
          audio.onended = finish;
          audio.onerror = finish;
          void audio.play().catch(() => finish());
        })
        .catch(err => {
          if (!controller.signal.aborted) { console.warn('Kokoro TTS failed', err); finish(); }
        });

      return () => {
        stopKokoro();
        useAppStore.getState().setTtsPending(false);
      };
    }

    // --- Browser engine: Web Speech API. ---
    if (!ttsSupported()) return;
    const utterance = new SpeechSynthesisUtterance(plain);
    const voice = speechSynthesis.getVoices().find(v => v.voiceURI === s.ttsVoiceURI);
    if (voice) utterance.voice = voice;
    utterance.rate = rate;
    utterance.pitch = s.ttsPitch;
    utterance.onend = finish;
    utterance.onerror = finish;

    s.setTtsPending(true);
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);

    return () => {
      speechSynthesis.cancel();
      useAppStore.getState().setTtsPending(false);
    };
  }, [enabled, engine, messageId]);

  // Pause/resume together with playback.
  useEffect(() => {
    if (!enabled) return;
    if (engine === 'kokoro') {
      const a = audioRef.current;
      if (!a) return;
      if (isStreaming) void a.play().catch(() => {});
      else a.pause();
    } else if (ttsSupported()) {
      if (isStreaming) speechSynthesis.resume();
      else speechSynthesis.pause();
    }
  }, [enabled, engine, isStreaming]);

  // Full stop when TTS is switched off.
  useEffect(() => {
    if (!enabled) {
      if (ttsSupported()) speechSynthesis.cancel();
      stopKokoro();
      useAppStore.getState().setTtsPending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
};
