import { FontFamily, Theme } from './types';

export interface ThemeVars {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  bubbleAi: string;
  bubbleUser: string;
  bubbleUserText: string;
}

export interface ThemeDef {
  id: Theme;
  label: string;
  isDark: boolean;
  vars: ThemeVars;
  /** Force a font regardless of user setting (e.g. terminal). */
  font?: FontFamily;
  /** Tailwind max-width class for the reading column. */
  maxWidth?: string;
  /** Extra class applied to the app root (patterns, scanlines...). */
  rootClass?: string;
}

export const THEMES: Record<Theme, ThemeDef> = {
  light: {
    id: 'light', label: 'Light', isDark: false,
    vars: {
      bg: '#f8fafc', surface: '#ffffff', text: '#1e293b', muted: '#64748b',
      accent: '#3b82f6', border: 'rgba(15, 23, 42, 0.12)',
      bubbleAi: '#ffffff', bubbleUser: '#3b82f6', bubbleUserText: '#ffffff',
    },
  },
  dark: {
    id: 'dark', label: 'Dark', isDark: true,
    vars: {
      bg: '#0f172a', surface: '#1e293b', text: '#e2e8f0', muted: '#94a3b8',
      accent: '#60a5fa', border: 'rgba(226, 232, 240, 0.12)',
      bubbleAi: '#1e293b', bubbleUser: '#2563eb', bubbleUserText: '#ffffff',
    },
  },
  sepia: {
    id: 'sepia', label: 'Sepia', isDark: false,
    vars: {
      bg: '#f4ecd8', surface: '#efe4cb', text: '#5b4636', muted: '#8a715c',
      accent: '#a0622d', border: 'rgba(91, 70, 54, 0.18)',
      bubbleAi: '#eadfc6', bubbleUser: '#a0622d', bubbleUserText: '#f8f1e2',
    },
  },
  notebook: {
    id: 'notebook', label: 'Notebook', isDark: false,
    font: 'handwriting',
    rootClass: 'theme-notebook',
    vars: {
      bg: '#f9f5eb', surface: '#f3edda', text: '#2a2a2a', muted: '#6b6455',
      accent: '#b4552d', border: 'rgba(42, 42, 42, 0.15)',
      bubbleAi: 'transparent', bubbleUser: 'transparent', bubbleUserText: '#2a2a2a',
    },
  },
  terminal: {
    id: 'terminal', label: 'Terminal', isDark: true,
    font: 'mono',
    vars: {
      bg: '#000000', surface: '#0a1a0a', text: '#22c55e', muted: '#15803d',
      accent: '#4ade80', border: 'rgba(34, 197, 94, 0.35)',
      bubbleAi: '#050f05', bubbleUser: '#0c2912', bubbleUserText: '#4ade80',
    },
  },
  book: {
    id: 'book', label: 'Classic Book', isDark: false,
    font: 'serif',
    maxWidth: 'max-w-[65ch]',
    vars: {
      bg: '#fbf7ef', surface: '#f5efe2', text: '#3f3a33', muted: '#7d7566',
      accent: '#8c5b2f', border: 'rgba(63, 58, 51, 0.15)',
      bubbleAi: 'transparent', bubbleUser: 'transparent', bubbleUserText: '#3f3a33',
    },
  },
  phone: {
    id: 'phone', label: 'Phone Chat', isDark: false,
    maxWidth: 'max-w-md',
    rootClass: 'theme-phone',
    vars: {
      bg: '#e9edf2', surface: '#ffffff', text: '#111827', muted: '#6b7280',
      accent: '#3b82f6', border: 'rgba(17, 24, 39, 0.1)',
      bubbleAi: '#ffffff', bubbleUser: '#3b82f6', bubbleUserText: '#ffffff',
    },
  },
  essay: {
    id: 'essay', label: 'College Essay', isDark: false,
    font: 'serif',
    maxWidth: 'max-w-[800px]',
    vars: {
      bg: '#fdfcf8', surface: '#f6f4ec', text: '#222222', muted: '#6f6b60',
      accent: '#1d4ed8', border: 'rgba(34, 34, 34, 0.12)',
      bubbleAi: 'transparent', bubbleUser: 'transparent', bubbleUserText: '#222222',
    },
  },
  hacker: {
    id: 'hacker', label: 'Hacker', isDark: true,
    font: 'mono',
    maxWidth: 'max-w-[95%]',
    rootClass: 'theme-hacker',
    vars: {
      bg: '#010401', surface: '#03140a', text: '#00ff41', muted: '#0a8f36',
      accent: '#39ff6e', border: 'rgba(0, 255, 65, 0.3)',
      bubbleAi: '#020c05', bubbleUser: '#06240f', bubbleUserText: '#39ff6e',
    },
  },
  custom: {
    id: 'custom', label: 'Custom', isDark: true, // isDark recomputed from bg luminance
    vars: {
      bg: '#111827', surface: '#1f2937', text: '#ffffff', muted: '#9ca3af',
      accent: '#60a5fa', border: 'rgba(255, 255, 255, 0.15)',
      bubbleAi: '#1f2937', bubbleUser: '#2563eb', bubbleUserText: '#ffffff',
    },
  },
};

const hexToRgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
};

export const isColorDark = (hex: string): boolean => {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
};

const mix = (hex: string, withHex: string, amount: number): string => {
  const a = hexToRgb(hex);
  const b = hexToRgb(withHex);
  if (!a || !b) return hex;
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
};

/** Resolve the active theme, deriving custom-theme vars from the user's colors. */
export const resolveTheme = (theme: Theme, bgColor: string, textColor: string): ThemeDef => {
  const def = THEMES[theme] ?? THEMES.dark;
  if (theme !== 'custom') return def;
  const dark = isColorDark(bgColor);
  const towards = dark ? '#ffffff' : '#000000';
  return {
    ...def,
    isDark: dark,
    vars: {
      bg: bgColor,
      surface: mix(bgColor, towards, 0.07),
      text: textColor,
      muted: mix(textColor, bgColor, 0.35),
      accent: mix(textColor, bgColor, 0.15),
      border: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
      bubbleAi: mix(bgColor, towards, 0.08),
      bubbleUser: mix(bgColor, towards, 0.18),
      bubbleUserText: textColor,
    },
  };
};
