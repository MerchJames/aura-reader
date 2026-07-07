# Aura Reader

A local reader for reliving SillyTavern and KoboldAI stories. Import your chat
logs and replay them like a book — with streaming text, themes, highlights, and
a persistent library.

## Features

- **Library** — import multiple stories (drag & drop or file picker); progress,
  highlights, and starred chains are saved per story in your browser
  (IndexedDB). Settings persist across sessions.
- **Formats** — SillyTavern chats (`.jsonl`), KoboldAI/KoboldCpp saves
  (`.json`), and TavernAI character cards (`.png`, V1/V2/V3).
- **Reading modes** — Storybook (prose) and Chat (bubbles), continuous scroll
  or paginated book pages, resume where you left off.
- **Streaming playback** — text reveals letter-by-letter or word-by-word (with
  a WPM readout) with typewriter, smooth, magic, or fade animations, a
  configurable pause between messages, and optional read-aloud TTS (voice and
  rate selectable). Quoted dialogue is styled and animated separately from
  narration.
- **Themes** — Light, Dark, Sepia, Notebook, Terminal, Classic Book, Phone
  Chat, College Essay, Hacker, or fully custom colors.
- **Auto-formatter** — regex find/replace rules with flags, per-role targeting
  (AI/user), ordering, live preview, JSON import/export, and one-click presets
  (strip `<think>` blocks, OOC comments, HTML tags, smart typography, and
  more), plus granular toggles for paragraph spacing and dialogue layout.
- **Tools** — search, chain reordering, per-chain star settings,
  `{{user}}`/`{{char}}` substitution, highlight capture, and Markdown export.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Turn pages (paginated layout) |
| `Q` / `E` tap | Slower / faster |
| `E` hold | 3× speed while held |
| `Q` hold | Rewind while held |
| `W`/`S`, `A`/`D` | Zoom / pan (autofocus mode) |
| `F` hold + select | Save a highlight (autofocus mode) |
| `Esc` | Close settings / exit autofocus |

## Getting started

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:3000`).

## Building for production

```bash
npm run build
```

Static files are emitted to `dist/` — serve with any static file server
(`npx serve dist`).
