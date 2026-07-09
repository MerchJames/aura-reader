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
  messageCount: number;
  importedAt: number;
  progress?: StoryProgress | null;
  /** 0-100, how far through the story the reader is. */
  progressPct?: number;
}

export interface Story extends StoryMeta {
  messages: Message[];
  highlights: Highlight[];
  /** Starred chain settings, keyed by chain id. */
  stars?: Record<string, ChainStarSettings>;
}

export type Screen = 'library' | 'reader';
export type ViewMode = 'storybook' | 'chat' | 'overview' | 'highlights' | 'branches';
export type LayoutMode = 'continuous' | 'paginated';
export type Theme =
  | 'light' | 'dark' | 'sepia' | 'notebook' | 'terminal'
  | 'book' | 'phone' | 'essay' | 'hacker' | 'custom'
  | 'win98' | 'vista' | 'parchment' | 'synthwave' | 'amoled'
  | 'ocean' | 'forest' | 'sakura' | 'comic' | 'newspaper'
  | 'grimoire' | 'cyberpunk' | 'eink' | 'gameboy' | 'starlight' | 'manga';
export type FontFamily =
  | 'sans' | 'serif' | 'mono' | 'handwriting' | 'typewriter' | 'dyslexic'
  | 'rounded' | 'slab' | 'medieval' | 'comic';
/** Accent override; '' means use the theme's own accent. */
export type AccentColor =
  | '' | 'blue' | 'violet' | 'rose' | 'emerald' | 'amber'
  | 'sky' | 'crimson' | 'teal' | 'gold' | 'magenta';
export type AnimationStyle = 'typewriter' | 'smooth' | 'magic' | 'fade';
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

export type RevealMode = 'character' | 'word';

export interface AppConfig {
  theme: Theme;
  accentColor: AccentColor;
  fontFamily: FontFamily;
  fontSize: number;
  textColor: string;
  bgColor: string;
  animationStyle: AnimationStyle;
  hideMetadata: boolean;
  /** Show images embedded in messages / attached to them. */
  showImages: boolean;
  /** In autofocus, keep the streaming line auto-zoomed and centered. */
  autofocusAutoZoom: boolean;
  playbackSpeed: number;
  autoStream: boolean;
  autoFormat: boolean;
  autoFormatRules: AutoFormatRule[];
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
  importFiles: (files: File[]) => Promise<{ imported: number; errors: string[] }>;
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

  saveConfig: (name: string) => void;
  loadConfig: (name: string) => void;
  deleteConfig: (name: string) => void;
}
