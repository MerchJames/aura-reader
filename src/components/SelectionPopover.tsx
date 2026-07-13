import React from 'react';
import { Bot, MessageSquare, Pin, X } from 'lucide-react';
import { HIGHLIGHT_COLORS } from '../types';

interface SelectionPopoverProps {
  sel: { x: number; y: number; text: string; messageId?: string };
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  onClose: () => void;
  onHighlight: (color: string) => void;
  onNote: () => void;
  onAskAi: () => void;
  onPin: () => void;
}

export const SelectionPopover = ({
  sel, noteDraft, setNoteDraft, onClose, onHighlight, onNote, onAskAi, onPin,
}: SelectionPopoverProps) => (
  <div
    className="fixed z-[70] -translate-x-1/2 -translate-y-full flex flex-col gap-2 p-2.5 rounded-xl bg-surface border border-app-border shadow-2xl w-64"
    style={{ left: sel.x, top: sel.y - 10 }}
    onMouseUp={(e) => e.stopPropagation()}
  >
    <div className="flex items-center gap-1.5">
      {HIGHLIGHT_COLORS.map(c => (
        <button
          key={c.key}
          title={`Highlight ${c.label}`}
          onClick={() => onHighlight(c.key)}
          className="w-6 h-6 rounded-full border border-app-border hover:scale-110 transition-transform"
          style={{ background: c.bg }}
        />
      ))}
      <button
        onClick={onPin}
        disabled={!sel.messageId}
        className="ml-auto p-1 opacity-60 hover:opacity-100 disabled:opacity-30"
        title="Pin this passage to the side dock"
      >
        <Pin size={14} />
      </button>
      <button
        onClick={onClose}
        className="p-1 opacity-60 hover:opacity-100"
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
      onKeyDown={(e) => {
        if (e.key === 'Enter') onNote();
      }}
      placeholder="Add a note…"
      className="bg-app-text/5 border border-app-border rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/50"
    />

    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={onNote}
        disabled={!sel.messageId}
        className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90 disabled:opacity-40"
      >
        <MessageSquare size={13} /> Note
      </button>
      <button
        onClick={onAskAi}
        disabled={!sel.messageId}
        className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-app-border text-xs hover:bg-app-text/5 disabled:opacity-40"
      >
        <Bot size={13} /> Ask AI
      </button>
    </div>
  </div>
);
