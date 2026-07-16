import { useState, useRef } from 'react';
import { Loader2, ScrollText, Square, Table2, X } from 'lucide-react';
import { useAppStore } from '../store';
import { useAuraV2Store } from '../stores/useAuraV2Store';
import { useSummaryStore } from '../stores/useSummaryStore';
import { resolveContent } from '../utils/lens';
import { chatCompletion } from '../utils/aiClient';
import {
  estimateBudgetChars, runSheetFill, runSummary, SUMMARY_FORMATS, SummaryPassage,
} from '../utils/summarizer';
import { cn } from '../utils/cn';

type Mode = 'summary' | 'sheet';

/**
 * Agentic summarizer panel — map-reduce the whole story into one doc that lands
 * in a versioned "Story summary" pin. Runs as a single-model queue (one request
 * at a time) with live progress; re-running appends a new version to the pin.
 */
export const SummarizePanel = ({
  base, apiKey, model, onClose,
}: {
  base: string;
  apiKey: string;
  model: string;
  onClose: () => void;
}) => {
  const running = useSummaryStore(s => s.running);
  const phase = useSummaryStore(s => s.phase);
  const done = useSummaryStore(s => s.done);
  const total = useSummaryStore(s => s.total);
  const error = useSummaryStore(s => s.error);

  const [mode, setMode] = useState<Mode>('summary');
  const [formatId, setFormatId] = useState(SUMMARY_FORMATS[0].id);
  const [instruction, setInstruction] = useState('');
  const [sheetTitle, setSheetTitle] = useState('Story sheet');
  const [sheetColumns, setSheetColumns] = useState('Character, Role, Status');
  const [ratio, setRatio] = useState(0.8);
  const [result, setResult] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const contextTokens = useAppStore(s => s.aiAdvanced.contextSize);
  const budgetChars = estimateBudgetChars(contextTokens, ratio);

  const run = async () => {
    const app = useAppStore.getState();
    const story = app.currentStory;
    if (!story || !base || !model || running) return;
    const v2 = useAuraV2Store.getState();
    const overrides = v2.overridesByStory[story.id];
    const lensOn = !!v2.lensOnByStory[story.id];
    const passages: SummaryPassage[] = app.chains
      .flatMap(c => c.messages)
      .map(m => ({ name: m.name, content: resolveContent(m, overrides, lensOn) }))
      .filter(p => p.content.trim());
    if (passages.length === 0) return;

    const fmt = SUMMARY_FORMATS.find(f => f.id === formatId) ?? SUMMARY_FORMATS[0];
    const store = useSummaryStore.getState();
    const controller = new AbortController();
    abortRef.current = controller;
    setResult(null);
    const send = (messages: any, signal?: AbortSignal) =>
      chatCompletion(base, apiKey, model, messages, { temperature: 0.3 }, signal);

    // --- Sheet mode: fill a structured table with deduped rows. ---
    if (mode === 'sheet') {
      const columns = sheetColumns.split(',').map(c => c.trim()).filter(Boolean);
      if (columns.length === 0) return;
      store.begin();
      try {
        const rows = await runSheetFill({
          passages, budgetChars, columns,
          instruction: instruction.trim() || `Extract every distinct ${columns[0].toLowerCase()} and its details.`,
          card: story.card, send, signal: controller.signal,
          onPhase: (p, d, t) => useSummaryStore.getState().step(p, d, t),
        });
        if (controller.signal.aborted) { store.end(); return; }
        if (rows.length === 0) { store.fail('No rows were extracted.'); return; }
        useAuraV2Store.getState().addSheet(story.id, {
          title: sheetTitle.trim() || 'Story sheet', columns, rows,
        });
        store.end();
        setResult(`Created sheet “${sheetTitle.trim() || 'Story sheet'}” with ${rows.length} rows.`);
      } catch (e: any) {
        if (!controller.signal.aborted) store.fail(e?.message ?? 'Sheet fill failed.');
        else store.end();
      }
      return;
    }

    store.begin();
    try {
      const doc = await runSummary({
        passages,
        budgetChars,
        instruction: instruction.trim() || fmt.instruction,
        card: story.card,
        send,
        signal: controller.signal,
        onPhase: (p, d, t) => useSummaryStore.getState().step(p, d, t),
      });
      if (controller.signal.aborted) { store.end(); return; }
      if (!doc) { store.fail('No summary was produced.'); return; }

      // Land in the story's summary pin — version it if it already exists.
      const v2now = useAuraV2Store.getState();
      const existingId = v2now.summaryPinByStory[story.id];
      const existing = existingId
        ? (v2now.pinsByStory[story.id] ?? []).find(p => p.id === existingId)
        : undefined;
      if (existing) {
        v2now.addPinVersion(story.id, existing.id, {
          content: doc, source: 'ai', instruction: `Summary — ${fmt.name}`,
        });
      } else {
        v2now.addPin(story.id, {
          title: 'Story summary', format: 'markdown', content: doc, inContext: false, docked: true,
        });
        const created = (useAuraV2Store.getState().pinsByStory[story.id] ?? []).slice(-1)[0];
        if (created) v2now.setSummaryPin(story.id, created.id);
      }
      store.end();
      setResult(doc);
    } catch (e: any) {
      if (!controller.signal.aborted) store.fail(e?.message ?? 'Summary failed.');
      else store.end();
    }
  };

  const stop = () => { abortRef.current?.abort(); useSummaryStore.getState().end(); };

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="absolute inset-0 z-20 bg-surface/97 backdrop-blur-sm overflow-y-auto p-3.5 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold">
          <ScrollText size={15} className="text-accent" /> Summarize story
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-app-text/10"><X size={15} /></button>
      </div>

      <p className="text-[11px] text-muted">
        Reads the whole story in chunks that fit your model's context and writes
        each part — then combines them into a versioned “Story summary” pin, or
        fills a table. Runs one request at a time on your single model.
      </p>

      <div className="grid grid-cols-2 gap-1.5">
        {([['summary', 'Summary', ScrollText], ['sheet', 'Sheet', Table2]] as const).map(([m, label, Icon]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            disabled={running}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md border transition-colors',
              mode === m
                ? 'border-accent bg-accent/10 text-accent font-bold'
                : 'border-transparent bg-app-text/5 hover:bg-app-text/10',
            )}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {mode === 'summary' ? (
        <div>
          <p className="text-xs font-medium mb-1.5 opacity-80">Format</p>
          <div className="grid grid-cols-2 gap-1.5">
            {SUMMARY_FORMATS.map(f => (
              <button
                key={f.id}
                onClick={() => setFormatId(f.id)}
                disabled={running}
                className={cn(
                  'py-1.5 text-xs rounded-md border transition-colors',
                  formatId === f.id
                    ? 'border-accent bg-accent/10 text-accent font-bold'
                    : 'border-transparent bg-app-text/5 hover:bg-app-text/10',
                )}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <input
            value={sheetTitle}
            onChange={e => setSheetTitle(e.target.value)}
            disabled={running}
            placeholder="Sheet title"
            className="w-full rounded-md bg-app-bg border border-app-border px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
          />
          <input
            value={sheetColumns}
            onChange={e => setSheetColumns(e.target.value)}
            disabled={running}
            placeholder="Columns, comma-separated (first is the key)"
            className="w-full rounded-md bg-app-bg border border-app-border px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
          />
          <p className="text-[10px] text-muted">
            Rows are gathered across the story and de-duplicated by the first column.
          </p>
        </div>
      )}

      <textarea
        value={instruction}
        onChange={e => setInstruction(e.target.value)}
        disabled={running}
        rows={2}
        placeholder="Optional extra instruction (overrides the format's default)…"
        className="w-full resize-none rounded-md bg-app-bg border border-app-border px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
      />

      <div>
        <div className="flex items-center justify-between text-[11px] opacity-80 mb-1">
          <span>Context fill per chunk</span>
          <span className="font-mono">{Math.round(ratio * 100)}%</span>
        </div>
        <input
          type="range" min={0.5} max={0.95} step={0.05} value={ratio}
          onChange={e => setRatio(parseFloat(e.target.value))}
          disabled={running}
          className="w-full accent-accent"
        />
        <p className="text-[10px] text-muted mt-0.5">
          ~{budgetChars.toLocaleString()} chars/chunk
          {contextTokens > 0 ? ` (context ${contextTokens.toLocaleString()} tok)` : ' (default context — set it in Advanced)'}
        </p>
      </div>

      {running ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="capitalize flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              {phase === 'reducing' ? 'Combining sections…' : `Reading section ${done + 1}/${Math.max(total, 1)}`}
            </span>
            <button onClick={stop} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-app-text/10 hover:bg-app-text/20">
              <Square size={10} /> Stop
            </button>
          </div>
          <div className="h-1.5 rounded-full bg-app-text/10 overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${phase === 'reducing' ? 100 : pct}%` }} />
          </div>
        </div>
      ) : (
        <button
          onClick={() => void run()}
          disabled={!base || !model}
          className="w-full py-2 rounded-lg bg-accent text-white font-medium disabled:opacity-40"
        >
          {mode === 'sheet' ? 'Fill the sheet from the story' : 'Summarize the whole story'}
        </button>
      )}

      {error && <p className="text-[11px] text-red-500">{error}</p>}
      {result && !running && (
        <div className="rounded-md border border-accent/40 bg-accent/[0.06] p-2 text-[11px]">
          <p className="font-medium text-accent mb-1">
            {mode === 'sheet' ? 'Done.' : 'Done — pinned as “Story summary”.'}
          </p>
          <p className="opacity-70 line-clamp-3 whitespace-pre-wrap">
            {mode === 'sheet' ? result : `${result.slice(0, 240)}…`}
          </p>
        </div>
      )}
    </div>
  );
};
