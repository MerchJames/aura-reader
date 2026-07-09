import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Bot, Loader2, RefreshCw, Send, Sparkles, X } from 'lucide-react';
import { useAppStore } from '../store';
import { candidateBases, chatCompletion, ChatMsg, listModels } from '../utils/aiClient';
import { cn } from '../utils/cn';

type Scope = 'page' | 'here' | 'all';

interface ContextOpts {
  scope: Scope;
  includeHighlights: boolean;
  focusCharacter: string;
}

/** Gather the transcript for the chosen scope, resolving the live streaming text. */
const collectTranscript = (scope: Scope): { name: string; content: string }[] => {
  const { chains, currentChainIndex, currentMessageIndex, streamingMessage, streamedText } = useAppStore.getState();
  const text = (m: { id: string; content: string }) =>
    m.id === streamingMessage?.id ? streamedText : m.content;

  if (scope === 'page') {
    return (chains[currentChainIndex]?.messages ?? []).map(m => ({ name: m.name, content: text(m) }));
  }
  const flat: { name: string; content: string }[] = [];
  outer: for (let ci = 0; ci < chains.length; ci++) {
    for (let mi = 0; mi < chains[ci].messages.length; mi++) {
      const m = chains[ci].messages[mi];
      flat.push({ name: m.name, content: text(m) });
      if (scope === 'here' && ci === currentChainIndex && mi === currentMessageIndex) break outer;
    }
  }
  return flat;
};

// Hard ceiling only to avoid a pathological multi-MB request that no model
// could accept — the whole story is sent below this (~1M chars ≈ 250k tokens).
const MAX_CHARS = 1_000_000;

/** Build the system prompt for the assistant from the reader's chosen options. */
const buildContext = (opts: ContextOpts): string => {
  const s = useAppStore.getState();
  const { currentStory, chains } = s;
  const flat = collectTranscript(opts.scope);

  let body = flat.map(m => `${m.name}: ${m.content}`).join('\n\n');
  // Send the full scope. Only trim if it exceeds the safety ceiling, keeping
  // the most recent text.
  if (body.length > MAX_CHARS) body = `…(earliest text omitted to fit)…\n\n${body.slice(body.length - MAX_CHARS)}`;

  const total = chains.reduce((n, c) => n + c.messages.length, 0);
  const scopeLine =
    opts.scope === 'all' ? 'You can see the ENTIRE story.'
    : opts.scope === 'page' ? 'You can see only the CURRENT page.'
    : `You can see the story up to the reader's position (message ${flat.length} of ${total}). Do not invent or spoil events beyond it.`;

  // Reader's highlights + notes.
  const highlights = currentStory?.highlights ?? [];
  const highlightBlock = opts.includeHighlights && highlights.length
    ? [
        '',
        "--- READER'S HIGHLIGHTS & NOTES ---",
        ...highlights.map(h => `• "${h.text}"${h.note ? ` — note: ${h.note}` : ''}`),
      ].join('\n')
    : '';

  const focus = opts.focusCharacter.trim();
  const focusBlock = focus
    ? `\nThe reader is focused on the character "${focus}". Prioritize their actions, voice, motivations, and arc. If asked to write as them, match their established speech and personality from the text.`
    : '';

  return [
    `You are a reading assistant embedded in "Aura Reader", helping the reader with a story / roleplay chat titled "${currentStory?.title ?? 'Untitled'}".`,
    currentStory?.characterName ? `Main character: ${currentStory.characterName}.` : '',
    currentStory?.userName ? `The reader's own persona in this story is "${currentStory.userName}".` : '',
    scopeLine,
    `Help them summarize, recap, explain, discuss, synthesize, or write in-character — using ONLY the material below. Reply in markdown; LaTeX in $…$ / $$…$$ is supported.`,
    focusBlock,
    '',
    '--- STORY TEXT ---',
    body,
    highlightBlock,
  ].filter(Boolean).join('\n');
};

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'page', label: 'This page' },
  { value: 'here', label: 'Up to here' },
  { value: 'all', label: 'Whole story' },
];

const QUICK = [
  { label: 'Summarize', prompt: 'Give me a concise summary of the material you can see.' },
  { label: 'Recap last scene', prompt: 'Recap just the most recent scene in a few sentences.' },
  { label: 'Who is who?', prompt: 'List the characters that have appeared and one line about each.' },
  { label: 'Understand my character', prompt: "Analyze my persona's messages and choices. Summarize my character's personality, goals, voice, and how I've been playing them." },
  { label: 'Impersonate me', prompt: "Based on everything my persona has said and done, draft a reply for me at the current moment, written in my character's established voice." },
  { label: 'From my highlights', prompt: 'Using the passages I highlighted (and my notes), tie them together — what themes or throughline connect them?' },
];

const Bubble = ({ role, content }: ChatMsg) => (
  <div className={cn('flex', role === 'user' ? 'justify-end' : 'justify-start')}>
    <div
      className={cn(
        'max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm',
        role === 'user'
          ? 'bg-accent text-white rounded-br-sm'
          : 'bg-app-text/5 border border-app-border rounded-bl-sm',
      )}
    >
      {role === 'assistant' ? (
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
            {content}
          </ReactMarkdown>
        </div>
      ) : (
        <span className="whitespace-pre-wrap">{content}</span>
      )}
    </div>
  </div>
);

export const AIChat = () => {
  const store = useAppStore();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [resolvedBase, setResolvedBase] = useState('');
  const [probing, setProbing] = useState(false);
  const [scope, setScope] = useState<Scope>('here');
  const [includeHighlights, setIncludeHighlights] = useState(true);
  const [focusCharacter, setFocusCharacter] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasHighlights = (store.currentStory?.highlights?.length ?? 0) > 0;

  // Approximate size of the context that will be sent, for transparency.
  const contextChars = useMemo(
    () => buildContext({ scope, includeHighlights, focusCharacter }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, includeHighlights, focusCharacter, store.currentChainIndex,
     store.currentMessageIndex, store.currentStory?.id, store.currentStory?.highlights],
  );
  const approxTokens = Math.round(contextChars / 4);
  const sizeLabel = approxTokens >= 1000 ? `~${(approxTokens / 1000).toFixed(1)}k tok` : `~${approxTokens} tok`;

  const configured = !!store.aiBaseUrl && !!store.aiModel;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const loadModels = async () => {
    setProbing(true); setError(null);
    try {
      const { models: m, base } = await listModels(store.aiBaseUrl, store.aiApiKey);
      setModels(m);
      setResolvedBase(base);
      if (!store.aiModel && m.length) store.setAiModel(m[0]);
    } catch (e: any) {
      setError(e?.message ?? 'Could not reach the endpoint.');
    } finally {
      setProbing(false);
    }
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    const history: ChatMsg[] = [...messages, { role: 'user', content }];
    setMessages(history);
    setInput('');
    setLoading(true); setError(null);
    try {
      const base = resolvedBase || candidateBases(store.aiBaseUrl)[0];
      const reply = await chatCompletion(
        base, store.aiApiKey, store.aiModel,
        [{ role: 'system', content: buildContext({ scope, includeHighlights, focusCharacter }) }, ...history],
      );
      setMessages([...history, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setError(e?.message ?? 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[65] w-[min(420px,92vw)] h-[min(620px,80vh)] flex flex-col rounded-2xl border border-app-border bg-surface shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-app-border bg-app-text/5">
        <div className="flex items-center gap-2 font-bold text-sm">
          <Bot size={17} className="text-accent" /> Reading Assistant
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              title="Clear chat"
              className="p-1.5 rounded-full opacity-60 hover:opacity-100 hover:bg-app-text/10"
            >
              <RefreshCw size={15} />
            </button>
          )}
          <button
            onClick={() => store.setAiOpen(false)}
            className="p-1.5 rounded-full opacity-60 hover:opacity-100 hover:bg-app-text/10"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!configured ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          <p className="text-muted leading-relaxed">
            Connect any <b>OpenAI-compatible</b> endpoint (OpenAI, OpenRouter, LM Studio,
            Ollama, KoboldCpp…). Paste the base URL — the <code>/v1</code> prefix and
            endpoints are figured out for you.
          </p>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Base URL</span>
            <input
              type="text"
              placeholder="https://api.openai.com  ·  http://localhost:1234"
              value={store.aiBaseUrl}
              onChange={(e) => store.setAiBaseUrl(e.target.value)}
              className="mt-1 w-full bg-app-text/5 border border-app-border rounded-md px-2 py-1.5 outline-none focus:border-accent/50"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">API key (optional)</span>
            <input
              type="password"
              placeholder="sk-…  (leave blank for local)"
              value={store.aiApiKey}
              onChange={(e) => store.setAiApiKey(e.target.value)}
              className="mt-1 w-full bg-app-text/5 border border-app-border rounded-md px-2 py-1.5 outline-none focus:border-accent/50"
            />
          </label>
          <button
            onClick={loadModels}
            disabled={!store.aiBaseUrl || probing}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-accent text-white font-medium disabled:opacity-50"
          >
            {probing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {probing ? 'Connecting…' : 'Connect & load models'}
          </button>
          {models.length > 0 && (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Model</span>
              <select
                value={store.aiModel}
                onChange={(e) => store.setAiModel(e.target.value)}
                className="mt-1 w-full bg-app-text/5 border border-app-border rounded-md px-2 py-1.5 outline-none"
              >
                <option value="" className="text-black bg-white">Choose a model…</option>
                {models.map(m => (
                  <option key={m} value={m} className="text-black bg-white">{m}</option>
                ))}
              </select>
            </label>
          )}
          {models.length === 0 && store.aiBaseUrl && (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Model (manual)</span>
              <input
                type="text"
                placeholder="gpt-4o-mini, llama-3.1-8b…"
                value={store.aiModel}
                onChange={(e) => store.setAiModel(e.target.value)}
                className="mt-1 w-full bg-app-text/5 border border-app-border rounded-md px-2 py-1.5 outline-none focus:border-accent/50"
              />
            </label>
          )}
          {error && <p className="text-red-500 text-xs">{error}</p>}
        </div>
      ) : (
        <>
          <div className="border-b border-app-border px-2.5 py-2 space-y-2 bg-app-text/[0.03]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted font-bold">Context</span>
              <span className="text-[10px] text-muted font-mono" title={`${contextChars.toLocaleString()} characters sent to the model`}>
                {sizeLabel}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {SCOPES.map(sc => (
                <button
                  key={sc.value}
                  onClick={() => setScope(sc.value)}
                  className={cn(
                    'flex-1 text-[11px] py-1 rounded-md border transition-colors',
                    scope === sc.value
                      ? 'border-accent bg-accent/10 text-accent font-bold'
                      : 'border-app-border hover:bg-app-text/5',
                  )}
                >
                  {sc.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={focusCharacter}
                onChange={(e) => setFocusCharacter(e.target.value)}
                placeholder="Focus a character (optional)…"
                className="flex-1 min-w-0 bg-app-text/5 border border-app-border rounded-md px-2 py-1 text-xs outline-none focus:border-accent/50"
              />
              <button
                onClick={() => setIncludeHighlights(v => !v)}
                disabled={!hasHighlights}
                title={hasHighlights ? 'Include your highlights & notes as context' : 'No highlights yet'}
                className={cn(
                  'text-[11px] px-2 py-1 rounded-md border whitespace-nowrap transition-colors disabled:opacity-40',
                  includeHighlights && hasHighlights
                    ? 'border-accent bg-accent/10 text-accent font-bold'
                    : 'border-app-border hover:bg-app-text/5',
                )}
              >
                ★ Highlights
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-muted text-center">
                  Ask about the story — context: <b>{SCOPES.find(s => s.value === scope)?.label}</b>
                  {includeHighlights && hasHighlights ? ' + your highlights' : ''}.
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {QUICK.map(q => (
                    <button
                      key={q.label}
                      onClick={() => send(q.prompt)}
                      className="text-xs px-2.5 py-1 rounded-full border border-app-border hover:bg-app-text/5"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => <Bubble key={i} {...m} />)}
            {loading && (
              <div className="flex justify-start">
                <div className="px-3.5 py-2.5 rounded-2xl bg-app-text/5 border border-app-border">
                  <Loader2 size={16} className="animate-spin opacity-60" />
                </div>
              </div>
            )}
            {error && <p className="text-red-500 text-xs px-1">{error}</p>}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-app-border p-2.5 flex items-end gap-2">
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => store.setAiModel('')}
                title={`Model: ${store.aiModel} — click to reconfigure`}
                className="text-[10px] max-w-[90px] truncate px-2 py-1 rounded-md bg-app-text/5 hover:bg-app-text/10"
              >
                {store.aiModel}
              </button>
            </div>
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
              }}
              placeholder="Ask about the story…"
              className="flex-1 resize-none max-h-28 bg-app-text/5 border border-app-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/50"
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="p-2 rounded-lg bg-accent text-white disabled:opacity-40 shrink-0"
            >
              <Send size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};
