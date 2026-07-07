export type Role = 'user' | 'ai';

export interface Message {
  id: string;
  role: Role;
  name: string;
  content: string;
  avatar?: string;
  /** Alternate versions of this message (SillyTavern swipes / card greetings). */
  swipes?: string[];
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
export type ViewMode = 'storybook' | 'chat' | 'overview' | 'highlights';
export type LayoutMode = 'continuous' | 'paginated';
export type Theme =
  | 'light' | 'dark' | 'sepia' | 'notebook' | 'terminal'
  | 'book' | 'phone' | 'essay' | 'hacker' | 'custom';
export type FontFamily = 'sans' | 'serif' | 'mono' | 'handwriting' | 'typewriter' | 'dyslexic';
export type AnimationStyle = 'typewriter' | 'smooth' | 'magic' | 'fade';
export type DialogueStyle = 'normal' | 'italic' | 'bold' | 'bold-italic';
export type DialogueAnimation = 'none' | 'zoom' | 'pulse' | 'wave';

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
  fontFamily: FontFamily;
  fontSize: number;
  textColor: string;
  bgColor: string;
  animationStyle: AnimationStyle;
  hideMetadata: boolean;
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

  dialogueColor: string;
  dialogueStyle: DialogueStyle;
  dialogueAnimation: DialogueAnimation;
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

  addAutoFormatRule: (rule: AutoFormatRule) => void;
  updateAutoFormatRule: (id: string, updates: Partial<AutoFormatRule>) => void;
  removeAutoFormatRule: (id: string) => void;
  moveAutoFormatRule: (id: string, direction: -1 | 1) => void;
  importAutoFormatRules: (rules: AutoFormatRule[]) => void;

  saveConfig: (name: string) => void;
  loadConfig: (name: string) => void;
  deleteConfig: (name: string) => void;
}
