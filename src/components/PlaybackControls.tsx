import React, { useMemo } from 'react';
import { FastForward, Maximize2, Minimize2, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useAppStore } from '../store';
import { wordsPerSecond } from '../hooks/useStreamer';
import { ttsSupported } from '../hooks/useTTS';
import { cn } from '../utils/cn';

export const PlaybackControls = () => {
  const store = useAppStore();

  const flatMessages = useMemo(
    () => store.chains.flatMap(c => c.messages),
    [store.chains],
  );

  if (store.chains.length === 0 || store.viewMode === 'overview' || store.viewMode === 'highlights') {
    return null;
  }

  // Global reading position in messages (fractional while streaming).
  let position = 0;
  for (let c = 0; c < store.currentChainIndex; c++) {
    position += store.chains[c]?.messages.length ?? 0;
  }
  position += store.currentMessageIndex;
  if (store.streamingMessage) {
    const len = store.streamingMessage.content.length || 1;
    position += Math.min(1, store.streamedText.length / len);
  } else {
    position += 1;
  }
  const progress = flatMessages.length ? Math.min(1, position / flatMessages.length) : 0;

  const scrubTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(0.999, Math.max(0, (e.clientX - rect.left) / rect.width));
    const target = flatMessages[Math.floor(fraction * flatMessages.length)];
    if (target) store.jumpToMessage(target.id);
  };

  if (store.controlsMinimized) {
    return (
      <div
        className="fixed bottom-6 left-6 z-40 p-2.5 rounded-full shadow-lg border border-app-border bg-surface/90 backdrop-blur-md cursor-pointer hover:scale-105 transition-transform"
        onClick={() => store.setControlsMinimized(false)}
        title="Restore controls"
      >
        <Maximize2 size={20} />
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 p-3 rounded-2xl shadow-xl border border-app-border bg-surface/90 backdrop-blur-md w-[min(420px,90vw)]">
      <button
        onClick={() => store.setControlsMinimized(true)}
        className="absolute top-2 right-2 p-1 opacity-50 hover:opacity-100 rounded-full transition-colors"
        title="Minimize"
      >
        <Minimize2 size={14} />
      </button>

      <div className="flex items-center gap-4 px-6 pt-1">
        <button
          onClick={() => store.resetPlayback()}
          className="p-2 hover:bg-app-text/10 rounded-full transition-colors"
          title="Restart"
        >
          <RotateCcw size={20} />
        </button>

        <button
          onClick={() => store.setIsStreaming(!store.isStreaming)}
          title={store.isStreaming ? 'Pause (Space)' : 'Play (Space)'}
          className={cn(
            'p-3 rounded-full transition-transform active:scale-95 text-white shadow-md',
            store.isStreaming ? 'bg-orange-500 hover:bg-orange-600' : 'bg-accent hover:opacity-90',
          )}
        >
          {store.isStreaming
            ? <Pause size={24} fill="currentColor" />
            : <Play size={24} fill="currentColor" className="ml-1" />}
        </button>

        <button
          onClick={() => store.fastForward()}
          className="p-2 hover:bg-app-text/10 rounded-full transition-colors"
          title="Show everything instantly"
        >
          <FastForward size={20} />
        </button>

        {ttsSupported() && (
          <button
            onClick={() => store.setTtsEnabled(!store.ttsEnabled)}
            className={cn(
              'p-2 rounded-full transition-colors',
              store.ttsEnabled ? 'text-accent bg-accent/10' : 'opacity-60 hover:opacity-100 hover:bg-app-text/10',
            )}
            title={store.ttsEnabled ? 'Read aloud: on' : 'Read aloud: off'}
          >
            {store.ttsEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        )}
      </div>

      <div
        className="w-full px-2 group cursor-pointer"
        onClick={scrubTo}
        title="Jump to position"
      >
        <div className="h-1.5 rounded-full bg-app-text/10 overflow-hidden group-hover:h-2.5 transition-all">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 w-full text-xs text-muted">
        <span className="font-mono whitespace-nowrap">
          {Math.min(Math.ceil(position), flatMessages.length)} / {flatMessages.length}
        </span>
        {store.layoutMode === 'paginated' && (
          <span className="font-mono whitespace-nowrap">
            · pg {store.currentChainIndex + 1}/{store.chains.length}
          </span>
        )}
        <span className="ml-auto font-medium">Speed</span>
        <input
          type="range"
          min="1"
          max="100"
          value={store.playbackSpeed}
          onChange={(e) => store.setPlaybackSpeed(Number(e.target.value))}
          className="w-28 accent-[var(--app-accent)]"
        />
        <span className="font-mono whitespace-nowrap">
          {store.revealMode === 'word'
            ? `${Math.round(wordsPerSecond(store.playbackSpeed) * 60)} wpm`
            : store.playbackSpeed}
        </span>
      </div>
    </div>
  );
};
