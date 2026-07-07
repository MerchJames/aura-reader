import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '../store';
import { THEMES } from '../themes';
import { cn } from '../utils/cn';
import { Message } from '../types';
import { balanceEmphasis, isDialogueText, processText } from '../utils/textProcessor';
import { motion, AnimatePresence } from 'motion/react';

/** Themes that read better without chat bubbles. */
const MINIMAL_BUBBLE_THEMES = new Set(['book', 'notebook', 'essay']);

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
  // Follow the streaming text only while the reader is near the bottom;
  // scrolling up to reread suspends following until they return (or press play).
  const followRef = useRef(true);

  const [direction, setDirection] = React.useState(1);
  const prevIndexRef = useRef(store.currentChainIndex);

  useEffect(() => {
    if (store.currentChainIndex !== prevIndexRef.current) {
      setDirection(store.currentChainIndex > prevIndexRef.current ? 1 : -1);
      prevIndexRef.current = store.currentChainIndex;
    }
  }, [store.currentChainIndex]);

  useEffect(() => {
    if (store.isStreaming) {
      followRef.current = true;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [store.isStreaming]);

  useEffect(() => {
    if (store.isStreaming && store.layoutMode === 'continuous' && followRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [store.streamedText, store.visibleMessages.length, store.layoutMode, store.isStreaming]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  };

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
    if (id === store.streamingMessage?.id) {
      store.setIsStreaming(!store.isStreaming);
    } else {
      store.restreamFromId(id);
    }
  };

  const renderContent = (msg: Message, content: string, isStreamingMsg: boolean) => {
    const msgChain = store.chains.find(c => c.messages.some(m => m.id === msg.id));
    const msgAnim = (msgChain?.starred && msgChain?.starSettings?.animationStyle) || store.animationStyle;

    // The streaming message receives pre-processed partial text from the
    // streamer (dangling emphasis closed so partial *spans* render styled);
    // committed messages are processed here in full.
    const processedText = isStreamingMsg
      ? balanceEmphasis(content)
      : processText(content, {
          hideMetadata: store.hideMetadata,
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
              const animate = isStreamingMsg && store.isStreaming;
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
                  )}
                  {...props}
                />
              );
            },
            strong: ({ node: _node, ...props }) => (
              <strong className="font-bold text-amber-600 dark:text-amber-400" {...props} />
            ),
          }}
        >
          {processedText}
        </ReactMarkdown>
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
    const avatar = msg.avatar ?? (!isUser ? store.currentStory?.avatar : undefined);

    if (store.viewMode === 'storybook') {
      return (
        <div
          key={msg.id}
          onClick={() => handleMessageClick(msg.id)}
          title={isStreamingMsg ? 'Click to play/pause' : 'Click to replay from here'}
          className={cn(
            'mb-8 cursor-pointer hover:bg-app-text/5 transition-all duration-500 p-4 rounded-xl',
            isStreamingMsg ? 'opacity-100' : 'opacity-90',
            isUser && 'italic opacity-80 border-l-2 border-app-border pl-4 ml-2',
            isMsgZoomed && 'scale-105 transform origin-left shadow-lg bg-app-text/5 my-12',
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
        onClick={() => handleMessageClick(msg.id)}
        title={isStreamingMsg ? 'Click to play/pause' : 'Click to replay from here'}
        className={cn(
          'flex w-full mb-6 cursor-pointer group transition-all duration-500 gap-3',
          isUser ? 'justify-end flex-row-reverse' : 'justify-start',
          isMsgZoomed && cn('scale-105 transform my-8', isUser ? 'origin-right' : 'origin-left'),
        )}
      >
        {avatar && !isUser && !minimalBubbles && (
          <img
            src={avatar}
            alt={msg.name}
            className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-app-border"
            referrerPolicy="no-referrer"
          />
        )}
        <div
          className={cn(
            'max-w-[80%] px-5 py-4 relative transition-all',
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
          <div className="text-xs font-bold mb-2 opacity-70 uppercase tracking-wider">
            {msg.name}
          </div>
          {renderContent(msg, content, isStreamingMsg)}
        </div>
      </div>
    );
  };

  const maxWidth = themeDef.maxWidth
    ?? (store.viewMode === 'storybook' ? 'max-w-[65ch]' : 'max-w-4xl');

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className={cn(
        'flex-1 overflow-y-auto pb-44 transition-all duration-500',
        store.isAutofocusMode && 'overflow-x-hidden',
      )}
      style={{ fontSize: `${store.fontSize}px` }}
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
          (store.theme === 'book' || store.theme === 'essay') && 'py-12',
          store.theme === 'phone' && 'border-x border-app-border shadow-2xl min-h-screen pt-4 bg-app-bg',
        )}
        style={{
          transform: store.isAutofocusMode
            ? `scale(${store.autofocusZoom}) translateX(${store.autofocusPanX}px)`
            : 'none',
          transition: 'transform 0.3s ease-out',
          transformOrigin: 'top center',
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
  );
};
