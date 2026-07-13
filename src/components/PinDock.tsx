import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot, ChevronDown, ChevronUp, Lock, LockOpen, Move, PanelRightClose, PanelRightOpen, Pin as PinIcon, X,
} from 'lucide-react';
import { useAppStore } from '../store';
import { useAuraV2Store } from '../stores/useAuraV2Store';
import { Pin } from '../types';
import { cn } from '../utils/cn';

/**
 * AI-written HTML renders in a fully sandboxed iframe: no scripts, no
 * origin access — CSS/SVG charts and tables display, anything active
 * is inert. Theme colors are injected so the visual sits in the page.
 */
const HtmlPin = ({ pin }: { pin: Pin }) => {
  // Recompute whenever the theme (or a custom color) changes so the pin's
  // text/background track the reader instead of freezing at capture time.
  const themeKey = useAppStore(s => `${s.theme}|${s.textColor}|${s.bgColor}|${s.accentColor}`);
  const [doc, setDoc] = useState('');

  useEffect(() => {
    // Read the CSS vars a frame later: theme changes are applied in an
    // effect on <html>, so we wait for the browser to settle them in.
    const raf = requestAnimationFrame(() => {
      const root = getComputedStyle(document.documentElement);
      const bg = root.getPropertyValue('--app-bg').trim() || '#0f172a';
      const surface = root.getPropertyValue('--app-surface').trim() || '#1e293b';
      const text = root.getPropertyValue('--app-text').trim() || '#d1d5db';
      const border = root.getPropertyValue('--app-border').trim() || '#3f3f46';
      const accent = root.getPropertyValue('--app-accent').trim() || '#8b5cf6';
      setDoc(`<!doctype html><html><head><style>
        html,body{margin:0;padding:6px;background:${surface};color:${text};font:12px/1.5 system-ui,sans-serif}
        *{box-sizing:border-box;max-width:100%}
        table{border-collapse:collapse;width:100%;background:${bg}}
        th,td{border:1px solid ${border};padding:3px 6px;text-align:left}
        a{color:${accent}}
        img,svg{max-width:100%;height:auto}
      </style></head><body>${pin.content}</body></html>`);
    });
    return () => cancelAnimationFrame(raf);
  }, [pin.content, themeKey]);

  return (
    <iframe
      sandbox=""
      srcDoc={doc}
      title={pin.title}
      className="w-full rounded-md bg-surface"
      style={{ height: 220, border: 'none' }}
    />
  );
};

const PinCard = ({
  pin,
  storyId,
  hidden,
}: {
  pin: Pin;
  storyId: string;
  hidden?: boolean;
}) => {
  const updatePin = useAuraV2Store(s => s.updatePin);
  const cardRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const locked = pin.locked ?? true;
  // A pin "floats" once it has an absolute position — locking then freezes
  // it in place rather than snapping it back to the dock column.
  const floating = pin.x != null && pin.y != null;

  const startDrag = (e: React.MouseEvent) => {
    if (locked || !cardRef.current) return;
    draggingRef.current = true;
    setDragging(true);
    const rect = cardRef.current.getBoundingClientRect();
    offsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      // Live-position via local state only — committing to the persisted
      // store on every frame would re-serialize every pin (up to 150k chars
      // each) and stutter the whole app. We write to the store once, on drop.
      const next = { x: e.clientX - offsetRef.current.x, y: e.clientY - offsetRef.current.y };
      posRef.current = next;
      setDragPos(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      if (posRef.current) updatePin(storyId, pin.id, posRef.current);
      setDragPos(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [storyId, pin.id, updatePin]);

  const toggleLock = () => {
    if (locked) {
      // Unlocking pops the pin out of the dock column into a free-floating
      // card, seeded at its current on-screen spot so it doesn't jump.
      const patch: Partial<Pin> = { locked: false };
      if (pin.x == null && cardRef.current) {
        const r = cardRef.current.getBoundingClientRect();
        patch.x = r.left;
        patch.y = r.top;
      }
      updatePin(storyId, pin.id, patch);
    } else {
      // Locking keeps x/y untouched → the card stays exactly where it is.
      updatePin(storyId, pin.id, { locked: true });
    }
  };

  const live = dragPos ?? (floating ? { x: pin.x!, y: pin.y! } : null);
  const style: React.CSSProperties = live
    ? {
        position: 'fixed', left: live.x, top: live.y, width: 320, maxWidth: '85vw',
        zIndex: dragging ? 70 : locked ? 45 : 60,
      }
    : { position: 'relative' };

  return (
    <div
      ref={cardRef}
      style={style}
      hidden={hidden}
      className={cn(
        'rounded-xl border border-app-border bg-surface/95 shadow-lg overflow-hidden',
        !locked && 'cursor-move',
        dragging && 'ring-2 ring-accent/50 shadow-2xl',
      )}
    >
      <div
        className="flex items-center gap-1 px-2 py-1.5 border-b border-app-border/60 select-none text-app-text"
        onMouseDown={startDrag}
      >
        {!locked && <Move size={10} className="opacity-40 shrink-0" />}
        <PinIcon size={11} className="text-accent shrink-0" />
        <span className="text-[11px] font-bold truncate flex-1" title={pin.title}>{pin.title}</span>
        <button
          onClick={() => updatePin(storyId, pin.id, { inContext: !pin.inContext })}
          title={pin.inContext
            ? 'In AI context — the assistant can reference this. Click to exclude.'
            : 'Include in AI context'}
          className={cn(
            'p-1 rounded-md transition-colors text-app-text',
            pin.inContext ? 'text-accent bg-accent/15' : 'opacity-70 hover:opacity-100 hover:bg-app-text/10',
          )}
        >
          <Bot size={12} />
        </button>
        <button
          onClick={toggleLock}
          title={locked ? 'Unlock to move' : 'Lock in place'}
          className="p-1 rounded-md text-app-text opacity-70 hover:opacity-100 hover:bg-app-text/10 transition-colors"
        >
          {locked ? <Lock size={12} /> : <LockOpen size={12} />}
        </button>
        <button
          onClick={() => updatePin(storyId, pin.id, { collapsed: !pin.collapsed })}
          title={pin.collapsed ? 'Expand' : 'Collapse'}
          className="p-1 rounded-md text-app-text opacity-70 hover:opacity-100 hover:bg-app-text/10 transition-colors"
        >
          {pin.collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
        <button
          onClick={() => updatePin(storyId, pin.id, { docked: false })}
          title="Remove from dock (kept in the Sheets panel)"
          className="p-1 rounded-md text-app-text opacity-70 hover:opacity-100 hover:bg-app-text/10 transition-colors"
        >
          <X size={12} />
        </button>
      </div>
      {!pin.collapsed && (
        <div className="max-h-80 overflow-y-auto p-2 bg-surface">
          {pin.format === 'html' ? (
            <HtmlPin pin={pin} />
          ) : (
            <div className="markdown-body text-xs overflow-x-auto text-app-text">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{pin.content}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Right-margin dock for pinned visuals — the reader's charts and tables,
 * always in view while reading, one click to hide. On narrow windows the
 * cards overlay the text edge, so the whole dock collapses to a small
 * "N pins" chip. Pins that have been dragged out float free at their own
 * position; the rest live in the dock column.
 */
export const PinDock = () => {
  const story = useAppStore(s => s.currentStory);
  const screen = useAppStore(s => s.screen);
  const pins = useAuraV2Store(s => (story ? s.pinsByStory[story.id] : undefined));
  const dockOpen = useAuraV2Store(s => s.pinDockOpen);
  const setPinDockOpen = useAuraV2Store(s => s.setPinDockOpen);

  if (screen !== 'reader' || !story) return null;
  const docked = (pins ?? []).filter(p => p.docked);
  if (docked.length === 0) return null;

  const column = docked.filter(p => p.x == null);
  const floating = docked.filter(p => p.x != null);

  return (
    <>
      <div className="fixed right-4 top-20 z-50 pointer-events-auto">
        <button
          onClick={() => setPinDockOpen(!dockOpen)}
          title={dockOpen ? 'Hide all pins' : 'Show all pins'}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-surface/95 border border-app-border shadow-md text-[11px] font-medium opacity-70 hover:opacity-100 transition-opacity"
        >
          {dockOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
          {docked.length} pin{docked.length === 1 ? '' : 's'}
        </button>
      </div>
      {dockOpen && column.length > 0 && (
        <div className="fixed right-4 top-[6.5rem] bottom-28 z-40 w-80 max-w-[85vw] flex flex-col gap-2 pointer-events-none">
          <div className="pointer-events-auto flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
            {column.map(p => <PinCard key={p.id} pin={p} storyId={story.id} />)}
          </div>
        </div>
      )}
      {dockOpen && floating.map(p => (
        <PinCard key={p.id} pin={p} storyId={story.id} />
      ))}
    </>
  );
};
