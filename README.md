# Aura Reader

An immersive local reader for reliving **SillyTavern** and **KoboldAI** stories —
and for reading plain documents. Import your chat logs (or `.txt`/`.md`/`.docx`
files) and replay them like a book — streaming text, dozens of themes, highlights
with notes, a branch explorer, an optional AI reading & cowriting assistant, and
a persistent library. Everything is stored on your device; there is no server and
no account.

## Features

- **Library** — import multiple stories (drag & drop or file picker). Progress,
  highlights, notes, and starred chains are saved per story in your browser
  (IndexedDB); settings persist across sessions.
- **Formats** — SillyTavern chats (`.jsonl`, including hidden/narrator lines),
  KoboldAI/KoboldCpp saves (`.json`), TavernAI character cards (`.png`,
  V1/V2/V3), and plain **documents** (`.txt`, `.md`, `.docx`) — smart-segmented
  into pages by chapter/section headings (with a paragraph-based fallback) so any
  prose reads like a story.
- **Reading modes** — Storybook (prose) and Chat (bubbles), continuous scroll or
  paginated book pages, resume where you left off.
- **Streaming playback** — text reveals letter-by-letter or word-by-word (with a
  WPM readout) using typewriter, smooth, magic, or fade animations, a
  configurable pause between messages, and optional read-aloud **TTS** (voice,
  rate, and pitch selectable; rate can follow the reading speed).
- **Autofocus mode** — hands-free reading that auto-zooms and keeps the
  streaming line centered, dimming everything else.
- **Images** — inline and attached images render in both views, with a
  click-to-zoom lightbox.
- **Dialogue styling** — quoted speech is detected and styled apart from
  narration, with colour options and one-shot reveal effects (zoom, pulse, wave,
  glow, rise).
- **Highlights & notes** — select text (or hold `F`) to highlight in five
  colours and attach a note; highlights are painted back onto the text and
  collected in a dedicated view you can export.
- **Branches / What-Ifs** — browse SillyTavern swipes and Kobold alternates as
  selectable alternate takes, and read on from any of them.
- **AI reading assistant** (optional) — connect any **OpenAI-compatible**
  endpoint (OpenAI, OpenRouter, LM Studio, Ollama, KoboldCpp…). It reads the
  story with a selectable context scope (this page / up to here / whole story /
  branchline), can fold in your highlights and notes, focus on a character, and
  summarize, recap, synthesize, impersonate your persona, or discuss — with
  Markdown and LaTeX rendering. Replies **stream token-by-token**, each answer can
  be **regenerated and swiped** between takes, and conversations are saved as
  named, switchable **chat branches** per story. An **Advanced** panel exposes
  samplers (temperature, top_p, penalties, plus gated top_k/min_p/repetition for
  local backends), max output tokens, context budget, a custom system prompt, and
  a context template — tucked away since most readers never need it.
- **Context Zones** — hand-pick an exact slice of the story to feed the AI: any
  set of messages *plus* the full alternate versions (branchlines) of chosen
  ones. Saved and named per story, and assembled with placement-aware structure
  (index up top, curated material in the high-attention tail).
- **Lens Edit** — have the assistant rewrite any passage into a private "Lens"
  layer (translate it, tighten it, change the tone…). The draft streams in, is
  applied over the original in the reader, and you can swipe between drafts or
  regenerate — the underlying story is never touched.
- **Pin Sets** — capture the AI's charts, stat tables, and summaries as pinned
  visuals in the margin, then save named **sets** of them (which pins are shown
  and which are fed to the AI) and swap between sets in one click.
- **Cowrite presets** — one-click recipes for drafting with the AI: rank the
  alternate versions of a beat, blend the best of them, or check them against an
  earlier passage. Reference context grounds the request while the candidate
  branches and your instruction ride the high-attention tail, and you can save
  your own presets.
- **Themes** — 26 of them, from Light/Dark/Sepia to Terminal (CRT), Windows 98,
  Aero Glass, Fantasy Scroll, Synthwave, Grimoire, Cyberpunk, E-Ink, Game Boy,
  Starlight, Manga, and more — each with fitting fonts and optional ambient
  effects (scanlines, embers, petals, starfields…). Ambient effects can be
  toggled off in Settings, and they respect `prefers-reduced-motion`.
- **Customisation** — accent colours, an expanded font set, adjustable font size
  and content width, `[OOC: …]` handling (show / dim / hide), profile pictures
  for the character and your persona, and a Phone-Chat "dialogue only" texting
  mode (hover a bubble to reveal the narration around it).
- **Auto-formatter** — regex find/replace rules with flags, per-role targeting
  (AI/user), ordering, live preview, JSON import/export, and one-click presets
  (strip `<think>` blocks and OOC comments, HTML tags, smart typography,
  anti-slop cliché/phrase cleanup, and more), plus toggles for paragraph
  spacing, stray-bullet prevention, and dialogue layout.
- **Tools** — search, chain reordering, per-chain star settings,
  `{{user}}`/`{{char}}` substitution, and Markdown export.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Turn pages (paginated layout) |
| `Q` / `E` tap | Slower / faster |
| `E` hold | 3× speed while held |
| `Q` hold | Rewind while held |
| `W` / `S`, `A` / `D` | Zoom / pan (autofocus mode) |
| `F` hold + select | Highlight the selected text |
| `Ctrl`/`Cmd` + `F` | Focus search |
| `Esc` | Close settings / exit autofocus |

## Getting started (development)

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:3000`).

## Building

**Web (static site):**

```bash
npm run build
```

Static files are emitted to `dist/` — serve with any static file server
(`npx serve dist`) or host them anywhere.

**Desktop app (installer):** Aura Reader also ships as a native desktop app via
**Tauri v2** (the shell lives in `src-tauri/`).

Prerequisites (one-time): [Rust](https://rustup.rs) with the platform toolchain,
a C/C++ build environment (on Windows: **Visual Studio Build Tools** with the
"Desktop development with C++" workload; on Linux: `libwebkit2gtk-4.1-dev` and
`librsvg2-dev`), and the **WebView2** runtime on Windows (preinstalled on
Windows 11).

```bash
npm install
npm run app:build      # runs the web build, compiles the Rust shell, bundles installers
```

Installers land in `src-tauri/target/release/bundle/` — a Windows
`.exe` (NSIS) and `.msi`, a macOS `.dmg`, or a Linux `.AppImage`/`.deb`,
depending on the OS you build **on** (Tauri does not cross-compile, so build the
Windows `.exe` from Windows). Use `npm run app:dev` for a live desktop window
with hot reload.

> Icons in `src-tauri/icons/` are placeholders — run
> `npx tauri icon path/to/icon.png` with a square source image to regenerate the
> full set before shipping.

## Tech

Vite 6 · React 19 · TypeScript · Zustand · Tailwind CSS v4 · react-markdown +
KaTeX · Tauri 2. Stories live in IndexedDB; settings in localStorage. The AI
assistant talks to whatever OpenAI-compatible endpoint you configure and nothing
else leaves your machine.
