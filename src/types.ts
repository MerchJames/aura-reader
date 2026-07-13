export type Role = 'user' | 'ai';

/** Highlight swatch options: key → { label, background }. */
export const HIGHLIGHT_COLORS: { key: string; label: string; bg: string }[] = [
  { key: 'yellow', label: 'Yellow', bg: 'rgba(250, 204, 21, 0.4)' },
  { key: 'green', label: 'Green', bg: 'rgba(74, 222, 128, 0.4)' },
  { key: 'blue', label: 'Blue', bg: 'rgba(96, 165, 250, 0.4)' },
  { key: 'pink', label: 'Pink', bg: 'rgba(244, 114, 182, 0.4)' },
  { key: 'orange', label: 'Orange', bg: 'rgba(251, 146, 60, 0.45)' },
];

export interface Message {
  id: string;
  role: Role;
  name: string;
  content: string;
  avatar?: string;
  /** Images attached to the message (data URLs or resolvable URLs). */
  images?: string[];
  /** Alternate versions of this message (SillyTavern swipes / card greetings). */
  swipes?: string[];
  /** SillyTavern narrator / `/hide`-den entry — shown, but visually marked. */
  hidden?: boolean;
}

export interface ChainStarSettings {
  speed?: number;
  animationStyle?: AnimationStyle;
  zoom?: boolean;
}

export interface Chain {
  id: string;
  messages: Message[];
  starred: boolean;
  starSettings?: ChainStarSettings;
}

export type StoryFormat = 'sillytavern' | 'kobold' | 'card';

export interface Highlight {
  id: string;
  text: string;
  messageId?: string;
  timestamp: number;
  /** Optional annotation the reader attaches to the highlight. */
  note?: string;
  /** Highlight color key (see HIGHLIGHT_COLORS). */
  color?: string;
}

export interface StoryProgress {
  chainIndex: number;
  messageIndex: number;
}

/** One entry of a character card's embedded lorebook (character_book). */
export interface CardLoreEntry {
  /** Trigger keywords, e.g. ["Ravenholm", "the city"]. */
  keys: string[];
  /** Entry name/comment when the author gave one. */
  title?: string;
  content: string;
}

/**
 * Author-written companion data from a character card (V1/V2/CCv3).
 * Attached to a story at import; feeds avatars, the codex, and gives the
 * AI assistant richer ground truth for summaries.
 */
export interface CardInfo {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  creator?: string;
  creatorNotes?: string;
  tags?: string[];
  lorebook?: CardLoreEntry[];
  /** Card spec detected at parse: 'v1' | 'v2' | 'v3'. */
  spec?: string;
}

export interface StoryMeta {
  id: string;
  title: string;
  format: StoryFormat;
  characterName?: string;
  userName?: string;
  /** Data URL so it survives persistence. */
  avatar?: string;
  /** Reader-supplied profile pictures (data URLs), override generated avatars. */
  characterAvatar?: string;
  userAvatar?: string;
  /** Per-character avatars for group chats, keyed by character name. */
  characterAvatars?: Record<string, string>;
  messageCount: number;
  importedAt: number;
  progress?: StoryProgress | null;
  /** 0-100, how far through the story the reader is. */
  progressPct?: number;
  /** Card tags shown in the library (from an attached character card). */
  tags?: string[];
}

export interface Story extends StoryMeta {
  messages: Message[];
  highlights: Highlight[];
  /** Starred chain settings, keyed by chain id. */
  stars?: Record<string, ChainStarSettings>;
  /** Companion character-card data attached at import. */
  card?: CardInfo;
}

export type Screen = 'library' | 'reader';
export type ViewMode = 'storybook' | 'chat' | 'overview' | 'highlights' | 'branches';
export type LayoutMode = 'continuous' | 'paginated';
export type Theme =
  | 'light' | 'dark' | 'sepia' | 'notebook' | 'terminal'
  | 'book' | 'phone' | 'essay' | 'hacker' | 'custom'
  | 'win98' | 'vista' | 'parchment' | 'synthwave' | 'amoled'
  | 'ocean' | 'forest' | 'sakura' | 'comic' | 'newspaper'
  | 'grimoire' | 'cyberpunk' | 'eink' | 'gameboy' | 'starlight' | 'manga'
  | 'noir' | 'cozy' | 'aurora';
export type FontFamily =
  | 'sans' | 'serif' | 'mono' | 'handwriting' | 'typewriter' | 'dyslexic'
  | 'rounded' | 'slab' | 'medieval' | 'comic';
/** Accent override; '' means use the theme's own accent. */
export type AccentColor =
  | '' | 'blue' | 'violet' | 'rose' | 'emerald' | 'amber'
  | 'sky' | 'crimson' | 'teal' | 'gold' | 'magenta';
export type AnimationStyle =
  | 'typewriter' | 'smooth' | 'magic' | 'fade'
  // v2 reveals: blur-in, ink-bleed, RGB-split glitch, fade-up rise, and a
  // terminal "decrypt" caret that cycles glyphs ahead of the text.
  | 'blur' | 'ink' | 'glitch' | 'rise' | 'decrypt';
export type TtsEngine = 'browser' | 'kokoro';
/** Built-in Web Audio soundscapes (no assets, synthesized live). */
export type AmbientSound = 'rain' | 'wind' | 'fire' | 'waves' | 'drone';
export type DialogueStyle = 'normal' | 'italic' | 'bold' | 'bold-italic';
export type DialogueAnimation = 'none' | 'zoom' | 'pulse' | 'wave' | 'glow' | 'rise';
export type OocHandling = 'show' | 'dim' | 'hide';

export type RuleTarget = 'all' | 'ai' | 'user';

export interface AutoFormatRule {
  id: string;
  /** Human-readable name shown in the rule list. */
  label?: string;
  pattern: string;
  /** Regex flags, e.g. "gi". Defaults to "g". */
  flags?: string;
  replacement: string;
  /** Which message roles the rule applies to. Defaults to 'all'. */
  appliesTo?: RuleTarget;
  enabled: boolean;
}

export type StatDisplay = 'chips' | 'table' | 'hide';

export interface StatRule {
  id: string;
  label?: string;
  /** Pattern with `{key}` and `{value}` placeholders, e.g. "[{key}] {value}". */
  pattern: string;
  display: StatDisplay;
  enabled: boolean;
}

/** Reader-side override applied to a single message (never mutates source). */
export interface MessageOverride {
  messageId: string;
  kind: 'rewrite' | 'format';
  content: string;
  source: 'user' | 'ai' | 'template';
  note?: string;
  createdAt: number;
}

/** Pinnable table the reader keeps alongside a story. */
export interface Sheet {
  id: string;
  title: string;
  columns: string[];
  rows: Record<string, string>[];
  createdAt: number;
  updatedAt: number;
}

/** Per-word streaming text effect, independent of the block reveal animation. */
export type StreamEffect = 'none' | 'fade' | 'blur' | 'ink' | 'glitch' | 'rise';

export type PinFormat = 'html' | 'markdown';

/**
 * A visual the AI wrote inside the chat (HTML chart, stat table, code
 * block…) that the reader captured to keep beside the text. Docked pins
 * live in the right margin on wide windows; `inContext` feeds the pin
 * back to the AI as reference material.
 */
export interface Pin {
  id: string;
  title: string;
  format: PinFormat;
  content: string;
  /** Message the visual was captured from, when known. */
  messageId?: string;
  inContext: boolean;
  docked: boolean;
  collapsed?: boolean;
  /** Locked pins can't be dragged; unlocking pops the card out to float. */
  locked?: boolean;
  /** Absolute float position (px). Once set, the pin floats free of the dock
   *  column and keeps this spot even after being re-locked. */
  x?: number;
  y?: number;
  createdAt: number;
}

/** A reader note anchored to a specific passage (message + optional selected text). */
export interface Annotation {
  id: string;
  messageId: string;
  /** Optional selected passage the note is anchored to. */
  anchorText?: string;
  /** Start/end character offsets within the message content. */
  start?: number;
  end?: number;
  note: string;
  /** Who wrote this entry in the scoped thread; absent means the reader. */
  role?: 'user' | 'ai';
  createdAt: number;
  updatedAt: number;
}

export type RevealMode = 'character' | 'word';

export interface AppConfig {
  theme: Theme;
  accentColor: AccentColor;
  fontFamily: FontFamily;
  fontSize: number;
  textColor: string;
  bgColor: string;
  animationStyle: AnimationStyle;
  /** Per-word effect applied to text as it streams in. */
  streamEffect: StreamEffect;
  hideMetadata: boolean;
  /** Show images embedded in messages / attached to them. */
  showImages: boolean;
  /** In autofocus, keep the streaming line auto-zoomed and centered. */
  autofocusAutoZoom: boolean;
  playbackSpeed: number;
  autoStream: boolean;
  autoFormat: boolean;
  autoFormatRules: AutoFormatRule[];
  /** Force-formatting stat rules (live render transform, not stored overrides). */
  statRules: StatRule[];
  /** Auto-format sub-features (only active while autoFormat is on). */
  paragraphSpacing: boolean;
  dialogueOwnLine: boolean;
  smartTypography: boolean;
  /** Style "quoted dialogue" distinctly from narration. */
  styleQuotes: boolean;
  /** Replace {{user}} / {{char}} with the story's names. */
  substituteNames: boolean;

  /** Autoreader */
  revealMode: RevealMode;
  /** Pause between messages while auto-streaming, in ms. */
  messagePause: number;
  /** In paginated layout, stop streaming at the end of each page. */
  pauseAtPageEnd: boolean;
  ttsEnabled: boolean;
  ttsVoiceURI: string;
  ttsRate: number;
  ttsPitch: number;
  /** Let the reading-speed slider also drive the TTS voice speed. */
  ttsFollowSpeed: boolean;
  /** Which voice engine reads aloud: the OS Web Speech API or a Kokoro server. */
  ttsEngine: TtsEngine;
  /** Kokoro-FastAPI (OpenAI-compatible /v1/audio/speech) base URL. */
  kokoroBaseUrl: string;
  kokoroApiKey: string;
  /** Default Kokoro voice — used for narration and any unassigned speaker. */
  kokoroVoice: string;
  /** Kokoro voice for the reader's own persona (user messages). */
  kokoroUserVoice: string;
  /** Per-character Kokoro voice, keyed by the speaker's display name. */
  ttsVoiceByCharacter: Record<string, string>;

  /** Loop a quiet ambient bed while reading. */
  ambientEnabled: boolean;
  ambientVolume: number;
  /**
   * Ambient bed per theme, keyed by theme id. Value is either a built-in
   * soundscape (`builtin:rain`, `builtin:wind`…) or a custom audio URL.
   * Empty / missing means silence for that theme.
   */
  ambientByTheme: Record<string, string>;

  dialogueColor: string;
  dialogueStyle: DialogueStyle;
  dialogueAnimation: DialogueAnimation;

  /** Max content column width in px (0 = use the theme's default width). */
  contentWidth: number;
  /** What to do with out-of-character [OOC: ...] / (OOC: ...) asides. */
  oocHandling: OocHandling;
  /** Phone theme: show only dialogue, as received-text bubbles. */
  phoneDialogueOnly: boolean;
  /** Ambient theme effects (scanlines, particles, glows, animations). */
  themeEffects: boolean;

  /** AI assistant (OpenAI-compatible endpoint). */
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
}

export interface AppState extends AppConfig {
  // Library
  screen: Screen;
  library: StoryMeta[];
  libraryLoaded: boolean;
  currentStory: Story | null;

  // Playback data
  chains: Chain[];
  visibleMessages: Message[];
  streamingMessage: Message | null;
  streamedText: string;
  currentChainIndex: number;
  currentMessageIndex: number;
  isStreaming: boolean;

  // View state
  viewMode: ViewMode;
  layoutMode: LayoutMode;
  searchQuery: string;
  isAutofocusMode: boolean;
  autofocusZoom: number;
  autofocusPanX: number;
  isHighlightMode: boolean;
  reverseStream: boolean;
  controlsMinimized: boolean;
  settingsOpen: boolean;

  /** TTS coordination (transient, not persisted). */
  ttsPending: boolean;
  awaitingAdvance: boolean;

  /** Selected swipe/branch index per message id (transient). */
  swipeSelections: Record<string, number>;
  /** AI assistant modal open (transient). */
  aiOpen: boolean;

  savedConfigs: Record<string, AppConfig>;

  // Library actions
  initLibrary: () => Promise<void>;
  /** Import stories, optionally with companion character cards to auto-map. */
  importFiles: (files: File[], cardFiles?: File[]) => Promise<{ imported: number; errors: string[] }>;
  openStory: (id: string) => Promise<void>;
  closeStory: () => void;
  deleteStoryById: (id: string) => Promise<void>;
  persistStoryState: () => void;

  // Playback actions
  setIsStreaming: (isStreaming: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  advanceMessage: () => void;
  updateStreamedText: (text: string) => void;
  finishCurrentMessage: () => void;
  resetPlayback: () => void;
  restreamFromId: (id: string) => void;
  jumpToMessage: (id: string) => void;
  fastForward: () => void;
  nextPage: () => void;
  prevPage: () => void;

  // Chain actions
  reorderChains: (chains: Chain[]) => void;
  toggleStarChain: (chainId: string) => void;
  updateStarSettings: (chainId: string, settings: ChainStarSettings) => void;

  // Highlights
  addHighlight: (highlight: Highlight) => void;
  removeHighlight: (id: string) => void;

  // View / settings actions
  setViewMode: (mode: ViewMode) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setTheme: (theme: Theme) => void;
  setAccentColor: (accent: AccentColor) => void;
  setShowImages: (show: boolean) => void;
  setAutofocusAutoZoom: (on: boolean) => void;
  setFontFamily: (font: FontFamily) => void;
  setFontSize: (size: number) => void;
  setTextColor: (color: string) => void;
  setBgColor: (color: string) => void;
  setAnimationStyle: (style: AnimationStyle) => void;
  setStreamEffect: (effect: StreamEffect) => void;
  setHideMetadata: (hide: boolean) => void;
  setAutoStream: (autoStream: boolean) => void;
  setAutoFormat: (autoFormat: boolean) => void;
  setStyleQuotes: (styleQuotes: boolean) => void;
  setSubstituteNames: (substituteNames: boolean) => void;
  setParagraphSpacing: (paragraphSpacing: boolean) => void;
  setDialogueOwnLine: (dialogueOwnLine: boolean) => void;
  setSmartTypography: (smartTypography: boolean) => void;
  setRevealMode: (revealMode: RevealMode) => void;
  setMessagePause: (messagePause: number) => void;
  setPauseAtPageEnd: (pauseAtPageEnd: boolean) => void;
  setTtsEnabled: (ttsEnabled: boolean) => void;
  setTtsVoiceURI: (ttsVoiceURI: string) => void;
  setTtsRate: (ttsRate: number) => void;
  setTtsPitch: (ttsPitch: number) => void;
  setTtsFollowSpeed: (ttsFollowSpeed: boolean) => void;
  setTtsPending: (ttsPending: boolean) => void;
  setTtsEngine: (ttsEngine: TtsEngine) => void;
  setKokoroBaseUrl: (kokoroBaseUrl: string) => void;
  setKokoroApiKey: (kokoroApiKey: string) => void;
  setKokoroVoice: (kokoroVoice: string) => void;
  setKokoroUserVoice: (kokoroUserVoice: string) => void;
  /** Assign (or clear, with '') a Kokoro voice for a named speaker. */
  setCharacterVoice: (name: string, voice: string) => void;
  setAmbientEnabled: (ambientEnabled: boolean) => void;
  setAmbientVolume: (ambientVolume: number) => void;
  /** Set (or clear, with '') the ambient bed for a theme id. */
  setThemeAmbient: (theme: string, value: string) => void;
  setAwaitingAdvance: (awaitingAdvance: boolean) => void;
  setSearchQuery: (query: string) => void;
  setIsAutofocusMode: (isAutofocusMode: boolean) => void;
  setAutofocusZoom: (zoom: number) => void;
  setAutofocusPanX: (panX: number) => void;
  setIsHighlightMode: (isHighlightMode: boolean) => void;
  setReverseStream: (reverse: boolean) => void;
  setControlsMinimized: (minimized: boolean) => void;
  setSettingsOpen: (open: boolean) => void;

  setDialogueColor: (color: string) => void;
  setDialogueStyle: (style: DialogueStyle) => void;
  setDialogueAnimation: (animation: DialogueAnimation) => void;
  setContentWidth: (px: number) => void;
  setOocHandling: (mode: OocHandling) => void;
  setPhoneDialogueOnly: (on: boolean) => void;
  setThemeEffects: (on: boolean) => void;
  /** Set a profile picture (data URL) for the character or the user, per story. */
  setStoryAvatar: (who: 'character' | 'user', dataUrl: string | undefined) => void;
  /** Set a profile picture for a specific character by name (group chats). */
  setCharacterAvatar: (name: string, dataUrl: string | undefined) => void;

  setAiBaseUrl: (url: string) => void;
  setAiApiKey: (key: string) => void;
  setAiModel: (model: string) => void;
  setAiOpen: (open: boolean) => void;
  selectSwipe: (messageId: string, index: number) => void;
  updateHighlight: (id: string, updates: Partial<Highlight>) => void;

  addAutoFormatRule: (rule: AutoFormatRule) => void;
  updateAutoFormatRule: (id: string, updates: Partial<AutoFormatRule>) => void;
  removeAutoFormatRule: (id: string) => void;
  moveAutoFormatRule: (id: string, direction: -1 | 1) => void;
  importAutoFormatRules: (rules: AutoFormatRule[]) => void;

  addStatRule: (rule: StatRule) => void;
  updateStatRule: (id: string, updates: Partial<StatRule>) => void;
  removeStatRule: (id: string) => void;
  moveStatRule: (id: string, direction: -1 | 1) => void;

  saveConfig: (name: string) => void;
  loadConfig: (name: string) => void;
  deleteConfig: (name: string) => void;
}
