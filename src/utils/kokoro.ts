/**
 * Kokoro TTS client. Talks to a Kokoro-FastAPI server, which exposes an
 * OpenAI-compatible `/v1/audio/speech` endpoint (plus `/v1/audio/voices`).
 * Everything stays local — the audio bytes come back and play in the reader.
 */

/** Standard Kokoro v1.0 voice set — used as a fallback when the server
 *  doesn't answer `/v1/audio/voices`. */
export const KNOWN_KOKORO_VOICES = [
  'af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'af_sky', 'af_alloy', 'af_aoede',
  'af_jessica', 'af_kore', 'af_nova', 'af_river',
  'am_adam', 'am_michael', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_onyx',
  'am_puck', 'am_santa',
  'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily',
  'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
];

/** Normalize a base URL to its `/vN` API root (adds `/v1` if absent). */
const apiRoot = (base: string): string => {
  const b = base.trim().replace(/\/+$/, '');
  return /\/v\d+$/.test(b) ? b : `${b}/v1`;
};

const authHeaders = (apiKey: string): Record<string, string> =>
  apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

/** Synthesize speech; resolves to an audio Blob (mp3). */
export const kokoroSpeak = async (
  base: string,
  apiKey: string,
  voice: string,
  text: string,
  speed: number,
  signal?: AbortSignal,
): Promise<Blob> => {
  const res = await fetch(`${apiRoot(base)}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(apiKey) },
    body: JSON.stringify({
      model: 'kokoro',
      input: text,
      voice,
      response_format: 'mp3',
      speed: Math.min(2, Math.max(0.5, speed)),
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Kokoro ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  return res.blob();
};

/** List the server's available voices, falling back to the known set. */
export const listKokoroVoices = async (base: string, apiKey: string): Promise<string[]> => {
  try {
    const res = await fetch(`${apiRoot(base)}/audio/voices`, { headers: authHeaders(apiKey) });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data?.voices) ? data.voices : Array.isArray(data) ? data : [];
      if (list.length) return list.map(String);
    }
  } catch {
    /* offline / not a Kokoro server — fall through */
  }
  return KNOWN_KOKORO_VOICES;
};

/** Pick the Kokoro voice for a given speaker. */
export const voiceForSpeaker = (cfg: {
  role: string;
  name?: string;
  kokoroVoice: string;
  kokoroUserVoice: string;
  ttsVoiceByCharacter: Record<string, string>;
}): string => {
  if (cfg.role === 'user') return cfg.kokoroUserVoice || cfg.kokoroVoice;
  if (cfg.name && cfg.ttsVoiceByCharacter[cfg.name]) return cfg.ttsVoiceByCharacter[cfg.name];
  return cfg.kokoroVoice;
};
