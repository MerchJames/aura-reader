/**
 * Scene Director payoff mappings — pure lookups from a passage's descriptor to
 * an ambient bed (soundscapes, 5b) and to voice prosody (emotional TTS, 5c).
 * No assets: soundscapes reuse the synthesized builtin beds.
 */

import { AmbientSound, Mood } from '../types';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/* ---------------------------------------------------------------- */
/* 5b — soundscapes                                                  */
/* ---------------------------------------------------------------- */

/** Default bed per mood ('' = silence, e.g. bright/joyful scenes). */
const MOOD_AMBIENT: Record<Mood, AmbientSound | ''> = {
  tense: 'drone',
  ominous: 'drone',
  eerie: 'wind',
  melancholy: 'rain',
  tender: 'fire',
  joyful: '',
  action: 'wind',
  awe: 'waves',
  neutral: '',
};

/** A concrete location wins over the mood default when it's recognizable. */
const LOCATION_AMBIENT: [RegExp, AmbientSound][] = [
  [/rain|storm|downpour|drizzle/i, 'rain'],
  [/sea|ocean|shore|beach|wave|tide|harbou?r/i, 'waves'],
  [/fire|hearth|camp|fireplace|flame|forge/i, 'fire'],
  [/wind|mountain|cliff|plain|desert|moor|field/i, 'wind'],
  [/cave|dungeon|void|abyss|deep|crypt|tomb|underground/i, 'drone'],
];

/** Ambient sound for a scene (location keywords override the mood default). */
export const moodToAmbient = (mood: Mood, location?: string): AmbientSound | '' => {
  if (location) {
    for (const [re, sound] of LOCATION_AMBIENT) if (re.test(location)) return sound;
  }
  return MOOD_AMBIENT[mood] ?? '';
};

/** AmbientController spec for a scene ('' = no bed). */
export const sceneAmbientSpec = (mood: Mood, location?: string): string => {
  const sound = moodToAmbient(mood, location);
  return sound ? `builtin:${sound}` : '';
};

/** Scale the user's base volume by tension (0.7×…1.3×). */
export const tensionVolume = (base: number, tension: number): number =>
  clamp(base * (0.7 + clamp(tension, 0, 1) * 0.6), 0, 1);

/* ---------------------------------------------------------------- */
/* 5c — emotional TTS prosody                                        */
/* ---------------------------------------------------------------- */

export interface Prosody {
  /** Rate multiplier (×) applied on top of the base voice rate. */
  rate: number;
  /** Pitch multiplier (×) applied on top of the base voice pitch. */
  pitch: number;
}

/** Emotion → prosody nudges. Keys are lowercased single words. */
const EMOTION_PROSODY: Record<string, Prosody> = {
  afraid: { rate: 1.12, pitch: 1.12 }, fear: { rate: 1.12, pitch: 1.12 },
  scared: { rate: 1.12, pitch: 1.12 }, terrified: { rate: 1.18, pitch: 1.14 },
  angry: { rate: 1.1, pitch: 0.92 }, anger: { rate: 1.1, pitch: 0.92 }, furious: { rate: 1.16, pitch: 0.9 },
  sad: { rate: 0.9, pitch: 0.94 }, sorrow: { rate: 0.88, pitch: 0.93 }, grief: { rate: 0.85, pitch: 0.92 },
  happy: { rate: 1.06, pitch: 1.08 }, joy: { rate: 1.08, pitch: 1.1 }, joyful: { rate: 1.08, pitch: 1.1 },
  excited: { rate: 1.15, pitch: 1.12 },
  calm: { rate: 0.96, pitch: 1.0 }, tender: { rate: 0.94, pitch: 1.02 }, gentle: { rate: 0.94, pitch: 1.02 },
  tense: { rate: 1.05, pitch: 1.0 }, urgent: { rate: 1.15, pitch: 1.04 }, nervous: { rate: 1.1, pitch: 1.06 },
  awe: { rate: 0.92, pitch: 1.02 }, solemn: { rate: 0.9, pitch: 0.96 }, ominous: { rate: 0.92, pitch: 0.9 },
};

/**
 * Prosody for a spoken passage. A recognized emotion sets the base curve;
 * tension nudges rate/pitch up or down around neutral (0.5). Neutral input
 * returns {1, 1} so the voice is unchanged.
 */
export const emotionProsody = (emotion?: string, tension = 0.5): Prosody => {
  const base = emotion ? EMOTION_PROSODY[emotion.trim().toLowerCase()] : undefined;
  const t = (clamp(tension, 0, 1) - 0.5) * 0.12;
  return {
    rate: clamp((base?.rate ?? 1) + t, 0.6, 1.6),
    pitch: clamp((base?.pitch ?? 1) + t * 0.6, 0.6, 1.5),
  };
};
