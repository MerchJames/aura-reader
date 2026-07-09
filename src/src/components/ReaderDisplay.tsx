import React, { useEffect, useLayoutEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAppStore } from '../store';
import { THEMES } from '../themes';
import { cn } from '../utils/cn';
import { HIGHLIGHT_COLORS, Message } from '../types';
import { balanceEmphasis, isDialogueText, processText, truncateToWord } from '../utils/textProcessor';
import { paintHighlights } from '../utils/highlightPaint';
import { motion, AnimatePresence } from 'motion/react';

/** Strip markdown markers for a plain-text context preview. */
const plainish = (t: string): string =>
  t.replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim();

/**
 * Pull quoted spans out of a message for the phone "dialogue only" mode, each
 * paired with the narration surrounding it (from the previous line to the next)
 * so hovering a bubble can reveal the text around it.
 */
const extractDialogueSegments = (text: string): { quote: string; context: string }[] => {
  const re = /["“]([^"”\n]{1,400})["”]/g;
  const matches: { inner: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1].trim()) matches.push({ inner: m[1].trim(), start: m.index, end: re.lastIndex });
  }
  return matches.map((mm, i) => {
    const from = i > 0 ? matches[i - 1].end : 0;
    const to = i < matches.length - 1 ? matches[i + 1].start : text.length;
    const context = plainish(text.slice(from, to));
    return { quote: mm.inner, context };
  });
};

/** Themes that read better without chat bubbles. */
const MINIMAL_BUBBLE_THEMES = new Set(['book', 'notebook', 'essay', 'newspaper']);

/** Deterministic color from a name, for fallback avatars. */
const avatarColor = (name: string): string => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 52% 45%)`;
};

const Avatar = ({ name, src }: { name: string; src?: string }) =>
  src ? (
    <img
      src={src}
      alt={name}
      className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-app-border"
      referrerPolicy="no-referrer"
    />
  ) : (
    <div
      className="w-10 h-10 rounded-full shrink-0 ring-2 ring-app-border flex items-center justify-center text-white font-bold text-sm select-none"
      style={{ background: avatarColor(name || '?') }}
      aria-hidden
    >
      {(name?.trim()?.[0] ?? '?').toUpperCase()}
    </div>
  );

const textOf = (children: React.ReactNode): string => {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(textOf).join('');
  if (React.isValidElement(children)) return textOf((children.props as any).children);
  return '';
};

export const ReaderDisplay = () => {
  const store = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The currently-streaming message element — the focus target that the
  // viewport tracks so the live text never trails out of sight.
  const activeRef = useRef<HTMLDivElement>(null);
  // Follow the streaming text only while the reader is near the bottom;
  // scrolling up to reread suspends following until they return (or press play).
  const followRef = useRef(true);
  // Distinguishes our own scroll writes from genuine user scrolls, so
  // auto-following never gets mistaken for the reader taking control.
  const programmaticRef = useRef(false);

  const [direction, setDirection] = React.useState(1);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [dialogueTip, setDialogueTip] = React.useState<
    { text: string; x: number; y: number; placement: 'top' | 'bottom' } | null
  >(null);
  const wasHighlightRef = useRef(false);

  // A single viewport-fixed tooltip for phone dialogue context, so it never
  // gets clipped by the scroll container or the top nav (as an in-bubble
  // tooltip did). Flips below the bubble when there isn't room above.
  const showDialogueTip = (e: React.MouseEvent<HTMLElement>, text: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    const placement: 'top' | 'bottom' = r.top < 170 ? 'bottom' : 'top';
    setDialogueTip({ text, x: r.left + r.width / 2, y: placement === 'top' ? r.top : r.bottom, placement });
  };
  const [selPopover, setSelPopover] = React.useState<
    { x: number; y: number; text: string; messageId?: string } | null
  >(null);
  const [noteDraft, setNoteDraft] = React.useState('');
  const prevIndexRef = useRef(store.currentChainIndex);

  useEffect(() => {
    if (store.currentChainIndex !== prevIndexRef.current) {
      setDirection(store.currentChainIndex > prevIndexRef.current ? 1 : -1);
      prevIndexRef.current = store.currentChainIndex;
    }
  }, [store.currentChainIndex]);

  // Scroll without it being counted as a user scroll (only when it moves).
  const scrollTo = (el: HTMLDivElement, top: number) => {
    const clamped = Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight));
    if (Math.abs(clamped - el.scrollTop) < 0.5) return;
    programmaticRef.current = true;
    el.scrollTop = clamped;
  };

  // Center the streaming line in the reading zone. In autofocus it sits higher
  // (~55%) so the reader looks at one spot; otherwise it rides near the bottom.
  const centerActive = () => {
    const el = scrollRef.current;
    if (!el) return;
    const active = activeRef.current;
    if (active) {
      const focusRatio = store.isAutofocusMode ? 0.55 : 0.72;
      const elRect = el.getBoundingClientRect();
      const aRect = active.getBoundingClientRect();
      const activeBottom = aRect.bottom - elRect.top + el.scrollTop;
      scrollTo(el, activeBottom - el.clientHeight * focusRatio);
    } else {
      scrollTo(el, el.scrollHeight);
    }
  };

  useEffect(() => {
    if (store.isStreaming) {
      followRef.current = true;
      requestAnimationFrame(centerActive);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.isStreaming, store.isAutofocusMode]);

  // Track the reveal BEFORE paint (useLayoutEffect) so the new character and
  // the scroll adjustment land in the same frame — otherwise the text paints
  // at the old position first, which reads as shaking.
  useLayoutEffect(() => {
    // Autofocus is hands-free: always follow. Otherwise honor scroll-up-to-pause.
    if (!store.isStreaming) return;
    if (!store.isAutofocusMode && !followRef.current) return;
    centerActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    store.streamedText, store.visibleMessages.length, store.isStreaming,
    store.isAutofocusMode, store.autofocusZoom, store.layoutMode,
  ]);

  // Entering autofocus: snap to the streaming line at once and, handsfree,
  // start playback so the view follows along immediately.
  useEffect(() => {
    if (!store.isAutofocusMode) return;
    followRef.current = true;
    const id = requestAnimationFrame(() => requestAnimationFrame(centerActive));
    if (!store.isStreaming && store.streamingMessage) store.setIsStreaming(true);
    // Entering fullscreen or resizing changes the viewport — re-center on it.
    const recenter = () => requestAnimationFrame(centerActive);
    window.addEventListener('resize', recenter);
    document.addEventListener('fullscreenchange', recenter);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', recenter);
      document.removeEventListener('fullscreenchange', recenter);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.isAutofocusMode]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Ignore the scroll event our own centering just produced.
    if (programmaticRef.current) { programmaticRef.current = false; return; }
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  };

  // Paint saved highlights back onto the text (CSS Custom Highlight API), so a
  // highlight is actually visible in place — not just an entry in the panel.
  // Runs on structural changes only (not per streamed char): committed text
  // nodes are stable while a later message streams.
  const highlights = store.currentStory?.highlights;
  useEffect(() => {
    const id = requestAnimationFrame(() => paintHighlights(scrollRef.current, highlights ?? []));
    return () => cancelAnimationFrame(id);
  }, [
    highlights, store.visibleMessages.length, store.viewMode,
    store.currentChainIndex, store.layoutMode, store.searchQuery, store.isStreaming,
  ]);

  // Highlight mode (hold F): pause streaming on entry so the DOM stops churning
  // and a selection can hold; on exit (F released) capture the selection as a
  // highlight — which the paint effect then makes visible immediately.
  useEffect(() => {
    const was = wasHighlightRef.current;
    wasHighlightRef.current = store.isHighlightMode;
    if (store.isHighlightMode && !was) {
      if (store.isStreaming) store.setIsStreaming(false);
      return;
    }
    if (!store.isHighlightMode && was) {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text) return;
      let node: Node | null = sel!.anchorNode;
      let messageId: string | undefined;
      while (node && node !== document.body) {
        if (node instanceof HTMLElement && node.dataset.msgId) { messageId = node.dataset.msgId; break; }
        node = node.parentNode;
      }
      store.addHighlight({
        id: Math.random().toString(36).slice(2, 9),
        text, messageId, timestamp: Date.now(), color: 'yellow',
      });
      sel?.removeAllRanges();
      setToast('Highlighted');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.isHighlightMode]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1400);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!store.isAutofocusMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const s = useAppStore.getState();
      const ZOOM_STEP = 0.1;
      const PAN_STEP = 30;

      switch (e.key.toLowerCase()) {
        case 'w': s.setAutofocusZoom(Math.min(3, s.autofocusZoom + ZOOM_STEP)); break;
        case 's': s.setAutofocusZoom(Math.max(0.5, s.autofocusZoom - ZOOM_STEP)); break;
        case 'a': s.setAutofocusPanX(s.autofocusPanX + PAN_STEP); break;
        case 'd': s.setAutofocusPanX(s.autofocusPanX - PAN_STEP); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store.isAutofocusMode]);

  if (store.chains.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center opacity-50 h-[80vh]">
        <p className="text-lg">This story is empty.</p>
      </div>
    );
  }

  const themeDef = THEMES[store.theme] ?? THEMES.dark;
  const minimalBubbles = MINIMAL_BUBBLE_THEMES.has(store.theme);

  const matchesSearch = (msg: Message) =>
    !store.searchQuery ||
    msg.content.toLowerCase().includes(store.searchQuery.toLowerCase()) ||
    msg.name.toLowerCase().includes(store.searchQuery.toLowerCase());

  const handleMessageClick = (id: string) => {
    // Ignore the click that ends a text selection (the reader was highlighting).
    if (window.getSelection()?.toString().trim()) return;
    if (id === store.streamingMessage?.id) {
      store.setIsStreaming(!store.isStreaming);
    } else {
      store.restreamFromId(id);
    }
  };

  const handleTextMouseUp = () => {
    // While holding F (highlight mode) the release captures the selection with a
    // default color — don't also pop the color/note picker.
    if (store.isHighlightMode) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { setSelPopover(null); return; }
    const text = sel.toString().trim();
    if (!text) { setSelPopover(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    let node: Node | null = sel.anchorNode;
    let messageId: string | undefined;
    while (node && node !== document.body) {
      if (node instanceof HTMLElement && node.dataset.msgId) { messageId = node.dataset.msgId; break; }
      node = node.parentNode;
    }
    setNoteDraft('');
    setSelPopover({ x: rect.left + rect.width / 2, y: rect.top, text, messageId });
  };

  const saveHighlight = (color: string) => {
    if (!selPopover) return;
    store.addHighlight({
      id: Math.random().toString(36).slice(2, 9),
      text: selPopover.text,
      messageId: selPopover.messageId,
      timestamp: Date.now(),
      note: noteDraft.trim() || undefined,
      color,
    });
    window.getSelection()?.removeAllRanges();
    setSelPopover(null);
    setToast('Highlighted');
  };

  const renderContent = (msg: Message, content: string, isStreamingMsg: boolean) => {
    const msgChain = store.chains.find(c => c.messages.some(m => m.id === msg.id));
    const msgAnim = (msgChain?.starred && msgChain?.starSettings?.animationStyle) || store.animationStyle;

    // The streaming message receives pre-processed partial text from the
    // streamer (dangling emphasis closed so partial *spans* render styled);
    // committed messages are processed here in full.
    const processedText = isStreamingMsg
      ? balanceEmphasis(truncateToWord(content))
      : processText(content, {
          hideMetadata: store.hideMetadata,
          oocHandling: store.oocHandling,
          autoFormat: store.autoFormat,
          autoFormatRules: store.autoFormatRules,
          paragraphSpacing: store.paragraphSpacing,
          dialogueOwnLine: store.dialogueOwnLine,
          smartTypography: store.smartTypography,
          styleQuotes: store.styleQuotes,
          substituteNames: store.substituteNames,
          characterName: store.currentStory?.characterName,
          userName: store.currentStory?.userName,
          role: msg.role,
        }).processedText;

    return (
      <div
        className={cn(
          'markdown-body max-w-none',
          msgAnim === 'smooth' && isStreamingMsg && 'animate-smooth-reveal',
          msgAnim === 'magic' && isStreamingMsg && 'animate-magic-reveal',
          msgAnim === 'fade' && isStreamingMsg && 'animate-fade-in',
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            em: ({ node: _node, ...props }) => {
              const dialogue = isDialogueText(textOf(props.children));
              if (!dialogue) {
                // Action / inner-thought emphasis
                return <em className="italic opacity-90" {...props} />;
              }
              // Only animate dialogue once the message has settled — running
              // the transform per streamed character makes the text shake.
              const animate = !isStreamingMsg && store.dialogueAnimation !== 'none';
              return (
                <em
                  className={cn(
                    store.dialogueColor,
                    store.dialogueStyle === 'italic' || store.dialogueStyle === 'bold-italic'
                      ? 'italic' : 'not-italic',
                    store.dialogueStyle === 'bold' || store.dialogueStyle === 'bold-italic'
                      ? 'font-bold' : 'font-medium',
                    animate && store.dialogueAnimation === 'zoom' && 'animate-dialogue-zoom inline-block',
                    animate && store.dialogueAnimation === 'pulse' && 'animate-dialogue-pulse inline-block',
                    animate && store.dialogueAnimation === 'wave' && 'animate-dialogue-wave inline-block',
                    animate && store.dialogueAnimation === 'glow' && 'animate-dialogue-glow',
                    animate && store.dialogueAnimation === 'rise' && 'animate-dialogue-rise',
                  )}
                  {...props}
                />
              );
            },
            strong: ({ node: _node, ...props }) => (
              <strong className="font-bold text-amber-600 dark:text-amber-400" {...props} />
            ),
            img: ({ node: _node, src, alt }) => {
              if (!store.showImages || !src) return null;
              return (
                <img
                  src={src as string}
                  alt={(alt as string) || ''}
                  className="reader-img"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onClick={(e) => { e.stopPropagation(); setLightbox(src as string); }}
                />
              );
            },
          }}
        >
          {processedText}
        </ReactMarkdown>
        {store.showImages && msg.images && msg.images.length > 0 && (
          <div className="reader-img-grid">
            {msg.images.map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                className="reader-img"
                loading="lazy"
                referrerPolicy="no-referrer"
                onClick={(e) => { e.stopPropagation(); setLightbox(src); }}
              />
            ))}
          </div>
        )}
        {msg.swipes && msg.swipes.length > 1 && (() => {
          const len = msg.swipes.length;
          const idx = store.swipeSelections[msg.id] ?? Math.max(0, msg.swipes.indexOf(msg.content));
          return (
            <div
              className="flex items-center gap-2 mt-3 text-xs opacity-70"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => store.selectSwipe(msg.id, (idx - 1 + len) % len)}
                className="w-6 h-6 rounded-full hover:bg-app-text/10 flex items-center justify-center"
                title="Previous version"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="font-mono tabular-nums">{idx + 1}/{len}</span>
              <button
                onClick={() => store.selectSwipe(msg.id, (idx + 1) % len)}
                className="w-6 h-6 rounded-full hover:bg-app-text/10 flex items-center justify-center"
                title="Next version"
              >
                <ChevronRight size={14} />
              </button>
              <span className="uppercase tracking-wider text-[10px] opacity-70">what-ifs</span>
            </div>
          );
        })()}
        {isStreamingMsg && (
          <span
            className={cn(
              'inline-block w-2 h-4 ml-1 align-middle animate-pulse',
              msgAnim === 'magic'
                ? 'bg-purple-500 shadow-[0_0_8px_2px_rgba(168,85,247,0.8)]'
                : 'bg-current',
            )}
          />
        )}
      </div>
    );
  };

  const renderMessage = (msg: Message, content: string, isStreamingMsg = false) => {
    const isUser = msg.role === 'user';
    const msgChain = store.chains.find(c => c.messages.some(m => m.id === msg.id));
    const isMsgZoomed = msgChain?.starred && msgChain?.starSettings?.zoom;
    // Reader-supplied profile pictures win, then the story's own avatar.
    const avatar = msg.avatar ?? (isUser
      ? store.currentStory?.userAvatar
      : store.currentStory?.characterAvatar ?? store.currentStory?.avatar);

    // Phone "dialogue only" — show just the spoken lines as received-text
    // bubbles; each quote becomes its own bubble, narration is hidden.
    if (store.theme === 'phone' && store.phoneDialogueOnly && store.viewMode !== 'storybook') {
      const segments = extractDialogueSegments(content);
      if (!segments.length) return null;
      return (
        <div
          key={msg.id}
          data-msg-id={msg.id}
          ref={isStreamingMsg ? activeRef : undefined}
          onClick={() => handleMessageClick(msg.id)}
          className={cn(
            'flex flex-col gap-1.5 mb-4',
            isUser ? 'items-end' : 'items-start',
            store.isAutofocusMode && !isStreamingMsg && 'opacity-25 blur-[1px]',
          )}
        >
          {segments.map((seg, i) => {
            const hasContext = seg.context && seg.context !== seg.quote;
            return (
              <div
                key={i}
                onMouseEnter={hasContext ? (e) => showDialogueTip(e, seg.context) : undefined}
                onMouseLeave={() => setDialogueTip(null)}
                className={cn(
                  'px-4 py-2 rounded-2xl shadow-sm text-[0.95em] leading-snug max-w-[78%]',
                  hasContext && 'cursor-help',
                  isUser
                    ? 'bg-bubble-user text-bubble-user-text rounded-br-md self-end'
                    : 'bg-bubble-ai border border-app-border/60 rounded-bl-md self-start',
                )}
              >
                {seg.quote}
              </div>
            );
          })}
          {isStreamingMsg && (
            <span className="inline-block w-2 h-3 bg-current animate-pulse rounded-full opacity-60" />
          )}
        </div>
      );
    }

    if (store.viewMode === 'storybook') {
      return (
        <div
          key={msg.id}
          data-msg-id={msg.id}
          ref={isStreamingMsg ? activeRef : undefined}
          onClick={() => handleMessageClick(msg.id)}
          title={isStreamingMsg ? 'Click to play/pause' : 'Click to replay from here'}
          className={cn(
            'mb-8 cursor-pointer hover:bg-app-text/5 transition-all duration-500 p-4 rounded-xl',
            isStreamingMsg ? 'opacity-100' : 'opacity-90',
            isUser && 'italic opacity-80 border-l-2 border-app-border pl-4 ml-2',
            isMsgZoomed && 'scale-105 transform origin-left shadow-lg bg-app-text/5 my-12',
            store.isAutofocusMode && !isStreamingMsg && 'opacity-25 blur-[1px]',
          )}
        >
          {renderContent(msg, content, isStreamingMsg)}
        </div>
      );
    }

    // Chat mode
    return (
      <div
        key={msg.id}
        data-msg-id={msg.id}
        ref={isStreamingMsg ? activeRef : undefined}
        onClick={() => handleMessageClick(msg.id)}
        title={isStreamingMsg ? 'Click to play/pause' : 'Click to replay from here'}
        className={cn(
          'flex w-full mb-6 cursor-pointer group transition-all duration-500 gap-3',
          isUser ? 'justify-end flex-row-reverse' : 'justify-start',
          isMsgZoomed && cn('scale-105 transform my-8', isUser ? 'origin-right' : 'origin-left'),
          store.isAutofocusMode && !isStreamingMsg && 'opacity-25 blur-[1px]',
        )}
      >
        {!minimalBubbles && <Avatar name={msg.name} src={avatar} />}
        <div
          className={cn(
            'reader-bubble max-w-[80%] px-5 py-4 relative transition-all',
            minimalBubbles
              ? 'rounded-none border-b border-app-border shadow-none max-w-full w-full'
              : cn(
                  'rounded-2xl shadow-md group-hover:ring-2 ring-accent/40',
                  isUser
                    ? 'bg-bubble-user text-bubble-user-text rounded-br-sm'
                    : 'bg-bubble-ai rounded-bl-sm border border-app-border/60',
                ),
            isMsgZoomed && 'ring-2 ring-yellow-500/50 shadow-xl',
          )}
        >
          <div className="reader-bubble-name text-xs font-bold mb-2 opacity-70 uppercase tracking-wider flex items-center gap-2">
            {msg.name}
            {msg.hidden && (
              <span className="normal-case tracking-normal font-medium text-[10px] px-1.5 py-0.5 rounded bg-app-text/10 opacity-80">
                hidden
              </span>
            )}
          </div>
          {renderContent(msg, content, isStreamingMsg)}
        </div>
      </div>
    );
  };

  // A custom content width (px) overrides the theme's default column width.
  const customWidth = store.contentWidth > 0;
  const maxWidth = customWidth
    ? ''
    : themeDef.maxWidth ?? (store.viewMode === 'storybook' ? 'max-w-[65ch]' : 'max-w-4xl');

  return (
    <>
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      onMouseUp={handleTextMouseUp}
      className={cn(
        'flex-1 min-h-0 overflow-y-auto pb-44 transition-all duration-500',
        store.isAutofocusMode && 'overflow-x-hidden pb-[45vh]',
      )}
      style={{ fontSize: `${store.fontSize * (store.isAutofocusMode ? store.autofocusZoom : 1)}px` }}
    >
      {store.isAutofocusMode && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 flex gap-2">
          <div className="bg-amber-500 text-black px-4 py-1.5 rounded-full shadow-lg text-xs font-bold tracking-widest uppercase animate-pulse">
            Autofocus (W/S zoom · A/D pan · Q/E speed)
          </div>
          {store.isHighlightMode && (
            <div className="bg-blue-500 text-white px-4 py-1.5 rounded-full shadow-lg text-xs font-bold tracking-widest uppercase">
              Highlighting
            </div>
          )}
        </div>
      )}

      <div
        className={cn('reader-page mx-auto pt-8 px-4 min-h-[80vh]', maxWidth,
          `view-${store.viewMode}`,
          (store.theme === 'book' || store.theme === 'essay') && 'py-12',
          store.theme === 'phone' && 'border-x border-app-border shadow-2xl min-h-screen pt-4 bg-app-bg',
        )}
        style={{
          transform: store.isAutofocusMode && store.autofocusPanX
            ? `translateX(${store.autofocusPanX}px)`
            : 'none',
          transition: 'transform 0.3s ease-out',
          transformOrigin: 'top center',
          ...(customWidth ? { maxWidth: `${store.contentWidth}px` } : null),
        }}
      >
        {store.layoutMode === 'paginated' && (
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-app-border sticky top-0 bg-app-bg/90 z-10 pt-4 backdrop-blur-sm">
            <button
              onClick={() => store.prevPage()}
              disabled={store.currentChainIndex === 0}
              className="flex items-center gap-1 opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-full hover:bg-app-text/5 transition-colors"
            >
              <ChevronLeft size={20} /> Prev
            </button>
            <span className="text-sm font-mono opacity-50 tracking-widest">
              PAGE {store.currentChainIndex + 1} / {store.chains.length}
            </span>
            <button
              onClick={() => store.nextPage()}
              disabled={store.currentChainIndex >= store.chains.length - 1}
              className="flex items-center gap-1 opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-full hover:bg-app-text/5 transition-colors"
            >
              Next <ChevronRight size={20} />
            </button>
          </div>
        )}

        {store.layoutMode === 'continuous' ? (
          <>
            {store.visibleMessages.filter(matchesSearch).map(msg => renderMessage(msg, msg.content))}
            {store.streamingMessage && matchesSearch(store.streamingMessage) &&
              renderMessage(store.streamingMessage, store.streamedText, true)}
            <div ref={bottomRef} className="h-10" />
          </>
        ) : (
          <div className="perspective-[2000px] w-full">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={store.currentChainIndex}
                custom={direction}
                variants={{
                  enter: (dir: number) =>
                    store.viewMode === 'storybook'
                      ? { opacity: 0, rotateY: dir > 0 ? 90 : -90, transformOrigin: dir > 0 ? 'left' : 'right', scale: 0.95 }
                      : { opacity: 0, x: dir > 0 ? 20 : -20, scale: 1 },
                  center: { opacity: 1, rotateY: 0, x: 0, scale: 1, transformOrigin: 'center' },
                  exit: (dir: number) =>
                    store.viewMode === 'storybook'
                      ? { opacity: 0, rotateY: dir > 0 ? -90 : 90, transformOrigin: dir > 0 ? 'left' : 'right', scale: 0.95 }
                      : { opacity: 0, x: dir > 0 ? -20 : 20, scale: 1 },
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
                className="min-h-[50vh]"
              >
                {store.visibleMessages.filter(matchesSearch).map(msg => renderMessage(msg, msg.content))}
                {store.streamingMessage && matchesSearch(store.streamingMessage) &&
                  renderMessage(store.streamingMessage, store.streamedText, true)}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>

    {selPopover && (
      <div
        className="fixed z-[70] -translate-x-1/2 -translate-y-full flex flex-col gap-2 p-2.5 rounded-xl bg-surface border border-app-border shadow-2xl w-64"
        style={{ left: selPopover.x, top: selPopover.y - 10 }}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5">
          {HIGHLIGHT_COLORS.map(c => (
            <button
              key={c.key}
              title={`Highlight ${c.label}`}
              onClick={() => saveHighlight(c.key)}
              className="w-6 h-6 rounded-full border border-app-border hover:scale-110 transition-transform"
              style={{ background: c.bg }}
            />
          ))}
          <button
            onClick={() => setSelPopover(null)}
            className="ml-auto p-1 opacity-60 hover:opacity-100"
            title="Cancel"
          >
            <X size={15} />
          </button>
        </div>
        <input
          type="text"
          autoFocus
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveHighlight(HIGHLIGHT_COLORS[0].key); }}
          placeholder="Add a note… (Enter to save)"
          className="bg-app-text/5 border border-app-border rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/50"
        />
      </div>
    )}

    {toast && (
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[75] px-4 py-2 rounded-full bg-app-text text-app-bg text-sm font-medium shadow-xl pointer-events-none">
        {toast}
      </div>
    )}

    {dialogueTip && (
      <div
        className="fixed z-[80] w-64 max-w-[70vw] px-3 py-2 rounded-xl bg-app-text text-app-bg text-xs leading-relaxed shadow-2xl pointer-events-none"
        style={{
          left: Math.min(Math.max(dialogueTip.x, 140), window.innerWidth - 140),
          top: dialogueTip.placement === 'top' ? dialogueTip.y - 8 : dialogueTip.y + 8,
          transform: dialogueTip.placement === 'top'
            ? 'translate(-50%, -100%)'
            : 'translate(-50%, 0)',
        }}
      >
        {dialogueTip.text}
      </div>
    )}

    {lightbox && (
      <div
        className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 cursor-zoom-out"
        onClick={() => setLightbox(null)}
      >
        <img
          src={lightbox}
          alt=""
          className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
          referrerPolicy="no-referrer"
        />
      </div>
    )}
    </>
  );
};
