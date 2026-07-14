import { CardInfo, CardLoreEntry, Message, StoryFormat } from '../types';

export interface ParsedStory {
  title: string;
  format: StoryFormat;
  characterName?: string;
  userName?: string;
  avatar?: string;
  messages: Message[];
  /** Companion character-card data (when the source was a card). */
  card?: CardInfo;
}

/** A character card parsed as a story companion (not a story itself). */
export interface ParsedCard {
  name: string;
  /** Data URL of the card PNG, used as avatar / cover. */
  avatar: string;
  info: CardInfo;
}

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(uid++).toString(36)}`;

const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '');

/** Pull image references out of a SillyTavern message `extra` object. */
export const collectImages = (extra: any): string[] => {
  if (!extra || typeof extra !== 'object') return [];
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
  };
  push(extra.image);
  push(extra.inline_image);
  if (Array.isArray(extra.image_swipes)) extra.image_swipes.forEach(push);
  if (Array.isArray(extra.images)) extra.images.forEach(push);
  // De-dupe while preserving order.
  return [...new Set(out)];
};

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

    // Note: we do NOT skip `is_system` entries. In SillyTavern that flag marks
    // narrator lines and `/hide`-den messages — those are still part of the
    // story the reader wants to see. Only genuinely empty entries are dropped.
    const content: string = parsed.mes ?? '';
    if (!content.trim() && !collectImages(parsed.extra).length) continue;

    const swipes: string[] | undefined =
      Array.isArray(parsed.swipes) && parsed.swipes.length > 1 ? parsed.swipes : undefined;

    // SillyTavern attaches generated/uploaded images under `extra`.
    const images = collectImages(parsed.extra);

    messages.push({
      id: nextId('st'),
      role: parsed.is_user ? 'user' : 'ai',
      name: parsed.name || (parsed.is_user ? userName || 'User' : characterName || 'Character'),
      content,
      images: images.length ? images : undefined,
      hidden: !!(parsed.is_system || parsed.hide) || undefined,
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

/** KoboldAI United keeps alternate generations for an action in `Options`. */
const koboldSwipes = (action: any, selected: string): string[] | undefined => {
  if (!action || typeof action !== 'object' || !Array.isArray(action.Options)) return undefined;
  const opts = action.Options
    .map((o: any) => (typeof o === 'string' ? o : o?.text ?? o?.['Selected Text'] ?? ''))
    .filter((t: string) => typeof t === 'string' && t.trim());
  const all = [...new Set([selected, ...opts].filter(Boolean))];
  return all.length > 1 ? all : undefined;
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
      swipes: koboldSwipes(action, content),
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

/** Normalize a card's embedded lorebook (character_book) entries. */
const cardLorebook = (book: any): CardLoreEntry[] | undefined => {
  if (!book || typeof book !== 'object') return undefined;
  const rows: any[] = Array.isArray(book.entries)
    ? book.entries
    : book.entries && typeof book.entries === 'object'
      ? Object.values(book.entries)
      : [];
  const out: CardLoreEntry[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object' || r.enabled === false || r.disable === true) continue;
    const content = typeof r.content === 'string' ? r.content.trim() : '';
    if (!content) continue;
    const rawKeys = Array.isArray(r.keys) ? r.keys : Array.isArray(r.key) ? r.key : [];
    const keys = rawKeys.filter((k: any) => typeof k === 'string' && k.trim())
      .map((k: string) => k.trim());
    const title = [r.comment, r.name].find(t => typeof t === 'string' && t.trim());
    out.push({ keys, title: title?.trim(), content });
  }
  return out.length ? out : undefined;
};

/**
 * Companion info from raw card JSON — V1 (flat), V2 (`data`), or CCv3.
 * Everything is optional; junk fields are dropped rather than crashing.
 */
export const cardInfoFromRaw = (raw: any): CardInfo => {
  const card = raw?.data && typeof raw.data === 'object' ? raw.data : raw ?? {};
  const spec = raw?.spec === 'chara_card_v3' ? 'v3'
    : raw?.spec === 'chara_card_v2' || raw?.data ? 'v2'
    : 'v1';
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    name: str(card.name),
    description: str(card.description),
    personality: str(card.personality),
    scenario: str(card.scenario),
    creator: str(card.creator),
    creatorNotes: str(card.creator_notes ?? card.creatorcomment),
    tags: Array.isArray(card.tags)
      ? card.tags.filter((t: any) => typeof t === 'string' && t.trim())
          .map((t: string) => t.trim()).slice(0, 12)
      : undefined,
    lorebook: cardLorebook(card.character_book),
    spec,
  };
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
    card: cardInfoFromRaw(raw),
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

/** Parse a card PNG as a *companion* for a story import (not a story). */
export const parseCompanionCard = async (file: File): Promise<ParsedCard> => {
  const buffer = await file.arrayBuffer();
  const raw = extractCardData(buffer);
  if (!raw) throw new Error(`${file.name}: no character data found in this PNG.`);
  const info = cardInfoFromRaw(raw);
  return {
    name: info.name || stripExtension(file.name),
    avatar: await fileToDataURL(file),
    info,
  };
};

/* ------------------------------------------------------------------ */
/* Plain documents (.txt, .md) and Word (.docx)                        */
/* ------------------------------------------------------------------ */

// "Chapter 3", "Part IV", "Act Two" — a section word followed by a number/word.
const CHAPTER_RE = /^(chapter|part|book|act|scene)\s+([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty)\b/i;
// Standalone section words that need no number.
const SECTION_RE = /^(prologue|epilogue|interlude|foreword|introduction|afterword)\b/i;

/** True for a short standalone line that reads like a chapter/section heading. */
const isHeading = (block: string): boolean => {
  const line = block.trim();
  if (/^#{1,6}\s+\S/.test(line)) return true; // markdown heading
  if (line.includes('\n') || line.length > 52) return false; // paragraphs aren't headings
  // A real heading isn't a sentence, so it shouldn't end in sentence punctuation.
  if (/[.!?,;:]$/.test(line)) return false;
  return CHAPTER_RE.test(line) || SECTION_RE.test(line);
};

/** Normalize a heading block to markdown (H2) so it renders as a chapter title. */
const asHeadingMarkdown = (block: string): string => {
  const line = block.trim();
  return /^#{1,6}\s+/.test(line) ? line : `## ${line}`;
};

/** Paragraphs per page when a document has no detectable chapters. */
const FALLBACK_CHAPTER_SIZE = 30;

/**
 * Segment prose (plain text or markdown) into messages — one per paragraph —
 * with chapter headings starting new chains (pages). When no chapters exist,
 * fall back to fixed-size grouping so pagination and streaming still get
 * sensible page breaks. Content stays markdown, so it flows through the same
 * formatting/theming pipeline as every other story.
 */
export const segmentProse = (raw: string, fileName: string): ParsedStory => {
  const blocks = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(Boolean);

  const hasHeadings = blocks.some(isHeading);
  const messages: Message[] = [];
  let firstHeading: string | undefined;
  let sinceBreak = 0;

  blocks.forEach((block, i) => {
    const heading = isHeading(block);
    const content = heading ? asHeadingMarkdown(block) : block;
    if (heading && !firstHeading) firstHeading = content.replace(/^#{1,6}\s+/, '').trim();

    const forcedBreak = !hasHeadings && sinceBreak >= FALLBACK_CHAPTER_SIZE;
    const startsChain = i === 0 || heading || forcedBreak;
    sinceBreak = startsChain ? 0 : sinceBreak + 1;

    messages.push({
      id: nextId('doc'),
      role: 'ai',
      name: '',
      content,
      startsChain: startsChain || undefined,
    });
  });

  return {
    title: firstHeading || stripExtension(fileName),
    format: 'document',
    messages,
  };
};

/** Convert mammoth's HTML output to lightweight markdown for the reader. */
const htmlToMarkdown = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const inner = Array.from(el.childNodes).map(inline).join('');
    switch (el.tagName) {
      case 'STRONG': case 'B': return inner.trim() ? `**${inner}**` : inner;
      case 'EM': case 'I': return inner.trim() ? `*${inner}*` : inner;
      case 'BR': return '\n';
      default: return inner;
    }
  };
  const out: string[] = [];
  doc.body.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').trim();
      if (t) out.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) {
      const level = Math.min(3, Number(tag[1]));
      const text = inline(el).trim();
      if (text) out.push(`${'#'.repeat(level)} ${text}`);
    } else if (tag === 'UL' || tag === 'OL') {
      Array.from(el.querySelectorAll('li')).forEach((li, i) => {
        const text = inline(li).trim();
        if (text) out.push(`${tag === 'OL' ? `${i + 1}.` : '-'} ${text}`);
      });
    } else if (tag === 'BLOCKQUOTE') {
      const text = inline(el).trim();
      if (text) out.push(`> ${text}`);
    } else {
      const text = inline(el).trim();
      if (text) out.push(text);
    }
  });
  return out.join('\n\n');
};

export const parseDocx = async (file: File): Promise<ParsedStory> => {
  const arrayBuffer = await file.arrayBuffer();
  // Lazy-load the browser build so mammoth stays out of the main bundle.
  const mod: any = await import('mammoth/mammoth.browser');
  const mammoth = mod.default ?? mod;
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const markdown = htmlToMarkdown(result.value || '');
  const parsed = segmentProse(markdown, file.name);
  if (parsed.messages.length === 0) throw new Error(`${file.name}: no readable text found in this document.`);
  return parsed;
};

/* ------------------------------------------------------------------ */

export const parseFile = async (file: File): Promise<ParsedStory> => {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.png')) {
    return parseTavernPNG(file);
  }
  if (lower.endsWith('.docx')) {
    return parseDocx(file);
  }
  const text = await file.text();
  if (lower.endsWith('.jsonl')) {
    return parseSillyTavernText(text, file.name);
  }
  if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return segmentProse(text, file.name);
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
  throw new Error('Unsupported file format. Load a .jsonl chat, .json save, .txt/.md document, .docx, or .png character card.');
};
