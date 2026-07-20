import { create } from 'zustand';
import {
  EmotionBucket, StoredSprite, deleteSprite, getAllSprites, putSprite,
} from '../lib/spriteStorage';

/**
 * User-uploaded character expression sprites for the Stage view. Bytes live
 * in IndexedDB; this store keeps the list plus object URLs ready to render.
 * Keyed by character name (lowercased) so one expression set follows the
 * character across every chat.
 */
interface SpriteState {
  sprites: StoredSprite[];
  /** sprite id → object URL, created once per session. */
  urls: Record<string, string>;
  loaded: boolean;
  error: string | null;
  loadSprites: () => Promise<void>;
  addSprite: (character: string, emotion: EmotionBucket, file: File) => Promise<void>;
  removeSprite: (id: string) => Promise<void>;
}

const urlFor = (s: StoredSprite): string =>
  URL.createObjectURL(new Blob([s.data], { type: s.type || 'image/png' }));

export const useSpriteStore = create<SpriteState>()((set, get) => ({
  sprites: [],
  urls: {},
  loaded: false,
  error: null,

  loadSprites: async () => {
    if (get().loaded) return;
    try {
      const sprites = await getAllSprites();
      const urls: Record<string, string> = {};
      for (const s of sprites) urls[s.id] = urlFor(s);
      set({ sprites, urls, loaded: true });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load sprites', loaded: true });
    }
  },

  addSprite: async (character, emotion, file) => {
    const key = character.trim().toLowerCase();
    if (!key) return;
    try {
      const data = await file.arrayBuffer();
      // One image per (character, emotion): replacing is the intuitive flow.
      const existing = get().sprites.find(s => s.character === key && s.emotion === emotion);
      const sprite: StoredSprite = {
        id: existing?.id ?? `sp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        character: key,
        emotion,
        data,
        type: file.type || 'image/png',
        addedAt: existing?.addedAt ?? Date.now(),
      };
      await putSprite(sprite);
      const urls = { ...get().urls };
      if (existing && urls[existing.id]) URL.revokeObjectURL(urls[existing.id]);
      urls[sprite.id] = urlFor(sprite);
      set({
        sprites: [...get().sprites.filter(s => s.id !== sprite.id), sprite],
        urls,
        error: null,
      });
    } catch (e: any) {
      set({ error: e?.message ?? `Could not add ${file.name}` });
    }
  },

  removeSprite: async (id) => {
    try {
      await deleteSprite(id);
    } catch { /* removing a missing sprite is fine */ }
    const url = get().urls[id];
    if (url) URL.revokeObjectURL(url);
    const { [id]: _gone, ...urls } = get().urls;
    set({ sprites: get().sprites.filter(s => s.id !== id), urls });
  },
}));

/** Resolve the sprite URL for a character's emotion, neutral as fallback. */
export const spriteFor = (
  character: string | undefined,
  bucket: EmotionBucket,
  sprites: StoredSprite[],
  urls: Record<string, string>,
): string | undefined => {
  if (!character) return undefined;
  const key = character.trim().toLowerCase();
  const hit = sprites.find(s => s.character === key && s.emotion === bucket)
    ?? sprites.find(s => s.character === key && s.emotion === 'neutral');
  return hit ? urls[hit.id] : undefined;
};
