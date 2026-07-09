import React, { useRef, useState } from 'react';
import { BookOpen, FileJson, Image, MessageSquare, Settings, Trash2, Upload, X } from 'lucide-react';
import { useAppStore } from '../store';
import { StoryFormat, StoryMeta } from '../types';
import { cn } from '../utils/cn';

const FORMAT_LABEL: Record<StoryFormat, string> = {
  sillytavern: 'SillyTavern',
  kobold: 'Kobold',
  card: 'Character Card',
};

const FORMAT_ICON: Record<StoryFormat, React.ReactNode> = {
  sillytavern: <MessageSquare size={13} />,
  kobold: <FileJson size={13} />,
  card: <Image size={13} />,
};

const COVER_GRADIENTS = [
  'from-indigo-500 to-purple-600',
  'from-rose-500 to-orange-500',
  'from-emerald-500 to-teal-600',
  'from-sky-500 to-blue-600',
  'from-amber-500 to-red-500',
];

const coverGradient = (id: string) => {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COVER_GRADIENTS[Math.abs(hash) % COVER_GRADIENTS.length];
};

const StoryCard = ({ story }: { story: StoryMeta }) => {
  const openStory = useAppStore(s => s.openStory);
  const deleteStoryById = useAppStore(s => s.deleteStoryById);
  const pct = story.progressPct ?? 0;

  return (
    <div
      onClick={() => void openStory(story.id)}
      className="group relative rounded-2xl border border-app-border bg-surface shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden"
    >
      <div className="flex items-stretch gap-0">
        <div className={cn(
          'w-24 shrink-0 flex items-center justify-center overflow-hidden',
          !story.avatar && `bg-gradient-to-br ${coverGradient(story.id)}`,
        )}>
          {story.avatar ? (
            <img src={story.avatar} alt={story.title} className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl font-serif font-bold text-white/90">
              {story.title.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 p-4">
          <h3 className="font-bold truncate pr-6">{story.title}</h3>
          <div className="flex items-center gap-1.5 text-xs text-muted mt-1">
            {FORMAT_ICON[story.format]}
            <span>{FORMAT_LABEL[story.format]}</span>
            <span>·</span>
            <span>{story.messageCount} messages</span>
          </div>
          <div className="text-xs text-muted mt-0.5">
            Imported {new Date(story.importedAt).toLocaleDateString()}
          </div>

          <div className="mt-3">
            <div className="h-1.5 rounded-full bg-app-text/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-[11px] text-muted mt-1">
              {pct > 0 ? `${pct}% read — click to continue` : 'Not started'}
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete "${story.title}" from your library?`)) {
            void deleteStoryById(story.id);
          }
        }}
        title="Delete story"
        className="absolute top-2.5 right-2.5 p-1.5 rounded-md text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 transition-all"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
};

export const Library = () => {
  const library = useAppStore(s => s.library);
  const libraryLoaded = useAppStore(s => s.libraryLoaded);
  const importFiles = useAppStore(s => s.importFiles);
  const setSettingsOpen = useAppStore(s => s.setSettingsOpen);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setImporting(true);
    try {
      const result = await importFiles(files);
      setErrors(result.errors);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto flex flex-col"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".jsonl,.json,.png"
        multiple
        onChange={(e) => {
          void handleFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />

      <header className="flex items-center justify-between px-6 sm:px-10 pt-8 pb-6 max-w-5xl w-full mx-auto">
        <div>
          <h1 className="text-3xl font-serif font-bold">Aura Reader</h1>
          <p className="text-sm text-muted mt-1">
            Relive your SillyTavern &amp; Kobold stories.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
          >
            <Upload size={16} />
            {importing ? 'Importing…' : 'Import'}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="p-2.5 rounded-lg border border-app-border hover:bg-app-text/5 transition-colors"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {errors.length > 0 && (
        <div className="max-w-5xl w-full mx-auto px-6 sm:px-10 mb-4">
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm relative">
            <button
              onClick={() => setErrors([])}
              className="absolute top-2 right-2 p-1 opacity-60 hover:opacity-100"
            >
              <X size={14} />
            </button>
            <p className="font-bold mb-1">Some files could not be imported:</p>
            {errors.map((err, i) => <p key={i} className="text-muted">{err}</p>)}
          </div>
        </div>
      )}

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 sm:px-10 pb-16">
        {!libraryLoaded ? null : library.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'mt-8 rounded-3xl border-2 border-dashed p-16 text-center cursor-pointer transition-colors',
              dragging
                ? 'border-accent bg-accent/10'
                : 'border-app-border hover:border-accent/60 hover:bg-app-text/5',
            )}
          >
            <BookOpen size={48} className="mx-auto mb-4 opacity-40" />
            <p className="text-lg font-bold">Your library is empty</p>
            <p className="text-sm text-muted mt-2">
              Drop files here or click to import — SillyTavern chats (.jsonl),
              Kobold saves (.json), or character cards (.png).
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {library.map(story => <StoryCard key={story.id} story={story} />)}
          </div>
        )}
      </main>

      {dragging && library.length > 0 && (
        <div className="fixed inset-0 z-50 bg-accent/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="rounded-2xl bg-surface border-2 border-dashed border-accent px-10 py-8 text-xl font-bold shadow-2xl">
            Drop to import
          </div>
        </div>
      )}
    </div>
  );
};
