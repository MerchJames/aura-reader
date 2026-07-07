import { Message, StoryFormat } from '../types';

export interface ParsedStory {
  title: string;
  format: StoryFormat;
  characterName?: string;
  userName?: string;
  avatar?: string;
  messages: Message[];
}

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(uid++).toString(36)}`;

const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '');

/* ------------------------------------------------------------------ */
/* SillyTavern .jsonl chats                                            */
/* ------------------------------------------------------------------ */

export const parseSillyTavernText = (text: string, fileName: string): ParsedStory => {
  const lines = text.split('\n').filter(l => l.trim().length > 0);

  let characterName: string | undefined;
  let userName: string | undefined;
  const messages: Message[] = [];

  for (const line of lines) {
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      console.warn('Skipping unparseable line:', line.slice(0, 120));
      continue;
    }

    // The first line of an ST chat file is a metadata header, not a message.
    if (parsed.mes === undefined) {
      if (parsed.character_name) characterName = parsed.character_name;
      if (parsed.user_name) userName = parsed.user_name;
      continue;
    }

    // Hidden system entries (e.g. checkpoint notes) aren't part of the story.
    if (parsed.is_system === true) continue;

    const swipes: string[] | undefined =
      Array.isArray(parsed.swipes) && parsed.swipes.length > 1 ? parsed.swipes : undefined;

    messages.push({
      id: nextId('st'),
      role: parsed.is_user ? 'user' : 'ai',
      name: parsed.name || (parsed.is_user ? userName || 'User' : characterName || 'Character'),
      content: parsed.mes || '',
      swipes,
    });

    if (!parsed.is_user && !characterName && parsed.name) characterName = parsed.name;
    if (parsed.is_user && !userName && parsed.name) userName = parsed.name;
  }

  return {
    title: characterName || stripExtension(fileName),
    format: 'sillytavern',
    characterName,
    userName,
    messages,
  };
};

/* ------------------------------------------------------------------ */
/* KoboldAI / KoboldCpp story saves (.json)                            */
/* ------------------------------------------------------------------ */

const koboldActionText = (action: any): string => {
  if (typeof action === 'string') return action;
  if (action && typeof action === 'object') {
    if (typeof action.content === 'string') return action.content;
    if (typeof action.text === 'string') return action.text;
    // KoboldAI United: { "Selected Text": "...", Options: [...] }
    if (typeof action['Selected Text'] === 'string') return action['Selected Text'];
  }
  return '';
};

export const parseKoboldText = (text: string, fileName: string): ParsedStory => {
  const parsed = JSON.parse(text);
  const messages: Message[] = [];
  const storyName = typeof parsed.story_name === 'string' ? parsed.story_name : undefined;

  if (typeof parsed.prompt === 'string' && parsed.prompt.trim()) {
    messages.push({
      id: nextId('kb'),
      role: 'ai',
      name: 'Prompt',
      content: parsed.prompt,
    });
  }

  // `actions` is an array in classic saves, an object map in newer ones.
  let actions: any[] = [];
  if (Array.isArray(parsed.actions)) {
    actions = parsed.actions;
  } else if (parsed.actions && typeof parsed.actions === 'object') {
    if (Array.isArray(parsed.actions.actions)) {
      actions = parsed.actions.actions;
    } else {
      actions = Object.keys(parsed.actions)
        .filter(k => !Number.isNaN(Number(k)))
        .sort((a, b) => Number(a) - Number(b))
        .map(k => parsed.actions[k]);
    }
  }

  actions.forEach(action => {
    const content = koboldActionText(action);
    if (!content.trim()) return;
    // Kobold stories are continuous prose, not chat turns — keep it all narration.
    messages.push({
      id: nextId('kb'),
      role: 'ai',
      name: 'Story',
      content,
    });
  });

  return {
    title: storyName || stripExtension(fileName),
    format: 'kobold',
    messages,
  };
};

/* ------------------------------------------------------------------ */
/* Tavern character cards (.png, V1 / V2 / V3)                         */
/* ------------------------------------------------------------------ */

const base64ToUtf8 = (b64: string): string => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
};

/** Extract embedded character JSON from PNG tEXt/iTXt chunks ('chara' or 'ccv3'). */
export const extractCardData = (buffer: ArrayBuffer): any | null => {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 8; // PNG signature
  let v2Data: any = null;
  let v3Data: any = null;

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (offset + 12 + length > bytes.length) break;

    if (type === 'tEXt' || type === 'iTXt') {
      const data = bytes.slice(offset + 8, offset + 8 + length);
      let nullIdx = data.indexOf(0);
      if (nullIdx > 0) {
        const keyword = String.fromCharCode(...data.slice(0, nullIdx));
        let payloadStart = nullIdx + 1;
        if (type === 'iTXt') {
          // iTXt: keyword \0 compressionFlag compressionMethod \0 language \0 translatedKeyword \0 text
          const compressed = data[nullIdx + 1] === 1;
          if (compressed) { offset += 12 + length; continue; }
          let nulls = 0;
          let i = nullIdx + 3;
          for (; i < data.length && nulls < 2; i++) {
            if (data[i] === 0) nulls++;
          }
          payloadStart = i;
        }
        if (keyword === 'chara' || keyword === 'ccv3') {
          try {
            const jsonText = base64ToUtf8(
              new TextDecoder('latin1').decode(data.slice(payloadStart)),
            );
            const parsed = JSON.parse(jsonText);
            if (keyword === 'ccv3') v3Data = parsed;
            else v2Data = parsed;
          } catch (e) {
            console.warn(`Failed to decode ${keyword} chunk`, e);
          }
        }
      }
    }
    if (type === 'IEND') break;
    offset += 12 + length;
  }

  return v3Data ?? v2Data;
};

const fileToDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const parseTavernPNG = async (file: File): Promise<ParsedStory> => {
  const buffer = await file.arrayBuffer();
  const raw = extractCardData(buffer);
  if (!raw) throw new Error('No character data found in this PNG.');

  // V2/V3 cards nest fields under `data`; V1 cards are flat.
  const card = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  const name: string = card.name || 'Character';
  const firstMes: string = card.first_mes || card.description || 'Hello.';
  const alternates: string[] = Array.isArray(card.alternate_greetings)
    ? card.alternate_greetings.filter((g: any) => typeof g === 'string' && g.trim())
    : [];

  const avatar = await fileToDataURL(file);

  return {
    title: name,
    format: 'card',
    characterName: name,
    avatar,
    messages: [
      {
        id: nextId('card'),
        role: 'ai',
        name,
        content: firstMes,
        swipes: alternates.length > 0 ? [firstMes, ...alternates] : undefined,
        avatar,
      },
    ],
  };
};

/* ------------------------------------------------------------------ */

export const parseFile = async (file: File): Promise<ParsedStory> => {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.png')) {
    return parseTavernPNG(file);
  }
  const text = await file.text();
  if (lower.endsWith('.jsonl')) {
    return parseSillyTavernText(text, file.name);
  }
  if (lower.endsWith('.json')) {
    // Some ST exports use .json but are still line-delimited chats.
    const trimmed = text.trimStart();
    if (trimmed.includes('\n') && !trimmed.startsWith('[')) {
      try {
        JSON.parse(text);
      } catch {
        return parseSillyTavernText(text, file.name);
      }
    }
    return parseKoboldText(text, file.name);
  }
  throw new Error('Unsupported file format. Load a .jsonl chat, .json save, or .png character card.');
};
