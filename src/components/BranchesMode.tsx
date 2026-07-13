import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GitBranch, PlayCircle } from 'lucide-react';
import { useAppStore } from '../store';
import { Message } from '../types';
import { cn } from '../utils/cn';

/** The active alternate index for a message with swipes. */
const activeIndex = (msg: Message, selections: Record<string, number>): number => {
  if (selections[msg.id] != null) return selections[msg.id];
  const found = msg.swipes?.indexOf(msg.content) ?? -1;
  return found >= 0 ? found : 0;
};

export const BranchesMode = () => {
  const store = useAppStore();

  const branching = store.chains
    .flatMap(c => c.messages)
    .filter(m => m.swipes && m.swipes.length > 1);

  if (branching.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center opacity-50 h-[80vh]">
        <div className="text-center space-y-2 max-w-md px-6">
          <GitBranch size={32} className="mx-auto opacity-60" />
          <p className="text-xl font-bold">No branches in this story.</p>
          <p className="text-sm">
            SillyTavern swipes and card greetings show up here as alternate
            "what-ifs" you can switch between. This story doesn't have any.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-8 pb-40">
      <div className="max-w-4xl mx-auto space-y-10">
        <div className="border-b border-app-border pb-4">
          <h2 className="text-2xl font-serif font-bold flex items-center gap-2">
            <GitBranch size={22} /> Branches &amp; What-Ifs
          </h2>
          <p className="text-muted mt-1 text-sm">
            {branching.length} message{branching.length === 1 ? '' : 's'} with alternate versions.
            Pick one to make it the version you read.
          </p>
        </div>

        {branching.map(msg => {
          const active = activeIndex(msg, store.swipeSelections);
          return (
            <div key={msg.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">
                  {msg.name} · {msg.swipes!.length} versions
                </span>
                <button
                  onClick={() => {
                    React.startTransition(() => {
                      store.selectSwipe(msg.id, active);
                      store.jumpToMessage(msg.id);
                    });
                  }}
                  title="Read from this message"
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-accent hover:bg-accent/10"
                >
                  <PlayCircle size={15} /> Read from here
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {msg.swipes!.map((text, i) => (
                  <button
                    key={i}
                    onClick={() => React.startTransition(() => store.selectSwipe(msg.id, i))}
                    className={cn(
                      'text-left p-4 rounded-xl border transition-all max-h-64 overflow-y-auto',
                      i === active
                        ? 'border-accent ring-1 ring-accent bg-accent/5'
                        : 'border-app-border bg-app-text/5 hover:border-app-border/80 opacity-80 hover:opacity-100',
                    )}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className={cn('w-2 h-2 rounded-full', i === active ? 'bg-accent' : 'bg-app-text/30')} />
                      Version {i + 1}{i === active && ' · reading'}
                    </div>
                    <div className="markdown-body text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {text.length > 600 ? `${text.slice(0, 600)}…` : text}
                      </ReactMarkdown>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
