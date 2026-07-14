import React, { useMemo, useState } from 'react';
import { Check, Combine, Copy, GitCompare, Pencil, Plus, Sparkles, X } from 'lucide-react';
import { Chain, CowriteCandidate, CowriteKind, CowritePreset, CowriteRunSpec } from '../types';
import { useAuraV2Store } from '../stores/useAuraV2Store';
import {
  BUILTIN_COWRITE_PRESETS, blankCowritePreset, buildCowritePayload, messageVersions, resolveCowriteSpec,
} from '../utils/cowrite';
import { flatWithIndex } from '../utils/contextZone';
import { cn } from '../utils/cn';

const KIND_LABEL: Record<CowriteKind, string> = {
  compare: 'Compare / rank',
  blend: 'Blend into one',
  freeform: 'Freeform',
};
const KIND_ICON: Record<CowriteKind, React.ReactNode> = {
  compare: <GitCompare size={12} />,
  blend: <Combine size={12} />,
  freeform: <Sparkles size={12} />,
};

/** Type-a-number field that resolves a 1-based reading index to a message id. */
const IndexAdder = ({
  max, placeholder, onAdd,
}: { max: number; placeholder: string; onAdd: (index1: number) => void }) => {
  const [v, setV] = useState('');
  const commit = () => {
    const n = parseInt(v, 10);
    if (n >= 1 && n <= max) { onAdd(n); setV(''); }
  };
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted text-[11px]">#</span>
      <input
        type="number"
        min={1}
        max={max}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        placeholder={placeholder}
        className="w-16 bg-app-text/5 border border-app-border rounded px-1.5 py-0.5 text-xs outline-none focus:border-accent/50"
      />
      <button onClick={commit} className="p-0.5 rounded hover:bg-app-text/10 text-accent" title="Add">
        <Plus size={13} />
      </button>
    </div>
  );
};

/**
 * Cowriting presets: pick a recipe, tune the reference window / anchors /
 * candidate branches, then Run. The panel only gathers the reader's picks; the
 * caller assembles + sends via buildCowritePayload so placement stays in one
 * place (utils/cowrite.ts).
 */
export const CowritePanel = ({
  chains, currentMessageId, onRun, onClose,
}: {
  chains: Chain[];
  currentMessageId?: string;
  onRun: (spec: CowriteRunSpec) => void;
  onClose: () => void;
}) => {
  const custom = useAuraV2Store(s => s.cowritePresets);
  const addCowritePreset = useAuraV2Store(s => s.addCowritePreset);
  const updateCowritePreset = useAuraV2Store(s => s.updateCowritePreset);
  const removeCowritePreset = useAuraV2Store(s => s.removeCowritePreset);

  const presets = useMemo<CowritePreset[]>(() => [...BUILTIN_COWRITE_PRESETS, ...custom], [custom]);
  const flat = useMemo(() => flatWithIndex(chains), [chains]);
  const byId = useMemo(() => new Map(flat.map(f => [f.msg.id, f])), [flat]);

  const [presetId, setPresetId] = useState(presets[0]?.id ?? '');
  const preset = presets.find(p => p.id === presetId) ?? presets[0];

  const [refLastN, setRefLastN] = useState(preset?.referenceLastN ?? 3);
  const [anchorIds, setAnchorIds] = useState<string[]>([]);
  const [instruction, setInstruction] = useState(preset?.instruction ?? '');
  const [candidates, setCandidates] = useState<CowriteCandidate[]>(
    () => (currentMessageId ? [{ messageId: currentMessageId, versions: [] }] : []),
  );
  const [editing, setEditing] = useState<CowritePreset | null>(null);

  // Adopt a preset's defaults when the reader switches to it.
  const selectPreset = (p: CowritePreset) => {
    setPresetId(p.id);
    setRefLastN(p.referenceLastN);
    setInstruction(p.instruction);
    if (!p.useAnchor) setAnchorIds([]);
  };

  const addCandidate = (index1: number) => {
    const id = flat[index1 - 1]?.msg.id;
    if (id && !candidates.some(c => c.messageId === id)) {
      setCandidates(cs => [...cs, { messageId: id, versions: [] }]);
    }
  };
  const removeCandidate = (id: string) => setCandidates(cs => cs.filter(c => c.messageId !== id));
  const toggleVersion = (id: string, vi: number, total: number) => {
    setCandidates(cs => cs.map(c => {
      if (c.messageId !== id) return c;
      const eff = c.versions.length ? c.versions : Array.from({ length: total }, (_, i) => i);
      const next = eff.includes(vi) ? eff.filter(i => i !== vi) : [...eff, vi].sort((a, b) => a - b);
      // Empty selection is meaningless — fall back to "all".
      return { ...c, versions: next.length === 0 ? [] : (next.length === total ? [] : next) };
    }));
  };

  const addAnchor = (index1: number) => {
    const id = flat[index1 - 1]?.msg.id;
    if (id && !anchorIds.includes(id)) setAnchorIds(a => [...a, id]);
  };

  // Live preview of what will be sent (counts + rough size).
  const preview = useMemo(() => {
    if (!preset) return null;
    const spec = resolveCowriteSpec(preset, chains, currentMessageId, {
      referenceLastN: refLastN, anchorIds, candidates, instruction,
    });
    const p = buildCowritePayload(spec, chains, m => m.content);
    return { spec, referenceCount: p.referenceCount, candidateCount: p.candidateCount,
      approxTokens: Math.round((p.system.length + p.userMessage.length) / 4) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, chains, currentMessageId, refLastN, anchorIds, candidates, instruction]);

  const run = () => { if (preview && preview.candidateCount > 0) onRun(preview.spec); };

  const label = (id: string) => {
    const e = byId.get(id);
    if (!e) return '(missing)';
    return `#${e.index} ${e.msg.name}: ${e.msg.content.replace(/\s+/g, ' ').slice(0, 32)}`;
  };

  if (editing) {
    return (
      <PresetEditor
        draft={editing}
        onCancel={() => setEditing(null)}
        onSave={(d) => {
          if (d.id.startsWith('new-')) {
            const id = addCowritePreset({ name: d.name, kind: d.kind, referenceLastN: d.referenceLastN, useAnchor: d.useAnchor, instruction: d.instruction });
            selectPreset({ ...d, id, builtIn: false });
          } else {
            updateCowritePreset(d.id, { name: d.name, kind: d.kind, referenceLastN: d.referenceLastN, useAnchor: d.useAnchor, instruction: d.instruction });
            setRefLastN(d.referenceLastN); setInstruction(d.instruction);
          }
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="absolute inset-0 z-10 bg-surface/97 backdrop-blur-sm overflow-y-auto p-3.5 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-bold flex items-center gap-1.5">
          <Combine size={15} className="text-accent" /> Cowrite
        </span>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-app-text/10 opacity-70 hover:opacity-100">
          <X size={15} />
        </button>
      </div>

      {/* Preset chips */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => {
          const active = p.id === presetId;
          return (
            <div
              key={p.id}
              className={cn(
                'group flex items-center rounded-full border text-[11px] transition-colors',
                active ? 'border-accent bg-accent/15 text-accent' : 'border-app-border bg-app-text/5 hover:bg-app-text/10',
              )}
            >
              <button onClick={() => selectPreset(p)} className="flex items-center gap-1 pl-2.5 pr-1 py-1 font-medium">
                {KIND_ICON[p.kind]}{p.name}
              </button>
              <button
                onClick={() => setEditing(p.builtIn ? { ...p, id: `new-${Date.now()}`, name: `${p.name} copy`, builtIn: false } : p)}
                title={p.builtIn ? 'Duplicate to a custom preset' : 'Edit preset'}
                className="p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100"
              >
                {p.builtIn ? <Copy size={10} /> : <Pencil size={10} />}
              </button>
              {!p.builtIn && (
                <button
                  onClick={() => { if (confirm(`Delete preset "${p.name}"?`)) { removeCowritePreset(p.id); if (active) selectPreset(BUILTIN_COWRITE_PRESETS[0]); } }}
                  className="p-0.5 pr-1.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:!text-red-500"
                  title="Delete preset"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={() => setEditing({ ...blankCowritePreset(), id: `new-${Date.now()}`, builtIn: false, createdAt: 0, updatedAt: 0 })}
          className="flex items-center gap-1 rounded-full border border-dashed border-app-border px-2.5 py-1 text-[11px] text-muted hover:text-app-text hover:border-accent/50"
        >
          <Plus size={11} /> New preset
        </button>
      </div>

      {/* Reference */}
      <div className="space-y-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted font-bold">Reference (grounding — sits above)</span>
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted">Last N messages before current</span>
          <input
            type="number" min={0} max={50} value={refLastN}
            onChange={(e) => setRefLastN(Math.max(0, Math.min(50, parseInt(e.target.value, 10) || 0)))}
            className="w-20 bg-app-text/5 border border-app-border rounded-md px-2 py-1 outline-none focus:border-accent/50"
          />
        </label>
        {preset?.useAnchor && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted">Anchored earlier passage(s)</span>
              <IndexAdder max={flat.length} placeholder="msg #" onAdd={addAnchor} />
            </div>
            {anchorIds.length > 0 && (
              <div className="space-y-1">
                {anchorIds.map(id => (
                  <div key={id} className="flex items-center gap-1.5 text-[11px] bg-app-text/5 rounded px-2 py-1">
                    <span className="flex-1 min-w-0 truncate" title={label(id)}>{label(id)}</span>
                    <button onClick={() => setAnchorIds(a => a.filter(x => x !== id))} className="opacity-60 hover:opacity-100"><X size={11} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Candidates */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted font-bold">Candidate branches (high-attention tail)</span>
          <IndexAdder max={flat.length} placeholder="msg #" onAdd={addCandidate} />
        </div>
        {candidates.length === 0 ? (
          <p className="text-[11px] text-muted italic">Add at least one message whose versions you want to {preset?.kind === 'blend' ? 'blend' : 'compare'}.</p>
        ) : (
          <div className="space-y-1.5">
            {candidates.map(c => {
              const e = byId.get(c.messageId);
              const versions = e ? messageVersions(e.msg) : [];
              const multi = versions.length > 1;
              const isOn = (i: number) => (c.versions.length ? c.versions.includes(i) : true);
              return (
                <div key={c.messageId} className="rounded-lg border border-app-border bg-app-text/5 px-2 py-1.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="flex-1 min-w-0 truncate" title={label(c.messageId)}>{label(c.messageId)}</span>
                    <span className="text-muted shrink-0">{multi ? `${versions.length} versions` : '1 version'}</span>
                    <button onClick={() => removeCandidate(c.messageId)} className="opacity-60 hover:opacity-100 hover:text-red-500 shrink-0"><X size={12} /></button>
                  </div>
                  {multi && (
                    <div className="flex flex-wrap gap-1">
                      {versions.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => toggleVersion(c.messageId, i, versions.length)}
                          className={cn(
                            'flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border',
                            isOn(i) ? 'border-accent bg-accent/15 text-accent' : 'border-app-border opacity-60 hover:opacity-100',
                          )}
                        >
                          {isOn(i) && <Check size={9} />}take {i + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Instruction (placed last) */}
      <label className="block text-xs space-y-1">
        <span className="text-muted">Instruction <span className="opacity-60">(sent as the final line)</span></span>
        <textarea
          rows={3} value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          className="w-full resize-y bg-app-text/5 border border-app-border rounded-md px-2 py-1.5 outline-none focus:border-accent/50"
        />
      </label>

      {preview && (
        <p className="text-[10px] text-muted font-mono">
          {preview.referenceCount} ref · {preview.candidateCount} candidate{preview.candidateCount === 1 ? '' : 's'} · ~{preview.approxTokens >= 1000 ? `${(preview.approxTokens / 1000).toFixed(1)}k` : preview.approxTokens} tok
        </p>
      )}

      <button
        onClick={run}
        disabled={!preview || preview.candidateCount === 0}
        className="w-full py-2 rounded-md bg-accent text-white text-sm font-bold disabled:opacity-40"
      >
        Run cowrite
      </button>
    </div>
  );
};

/** Create/edit a custom preset. Built-ins arrive here as a pre-filled copy. */
const PresetEditor = ({
  draft, onSave, onCancel,
}: {
  draft: CowritePreset;
  onSave: (d: CowritePreset) => void;
  onCancel: () => void;
}) => {
  const [d, setD] = useState(draft);
  const patch = (u: Partial<CowritePreset>) => setD(prev => ({ ...prev, ...u }));
  return (
    <div className="absolute inset-0 z-20 bg-surface/97 backdrop-blur-sm overflow-y-auto p-3.5 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-bold flex items-center gap-1.5">
          <Pencil size={14} className="text-accent" /> {draft.id.startsWith('new-') ? 'New preset' : 'Edit preset'}
        </span>
        <button onClick={onCancel} className="p-1 rounded-full hover:bg-app-text/10 opacity-70 hover:opacity-100"><X size={15} /></button>
      </div>

      <label className="block text-xs space-y-1">
        <span className="text-muted">Name</span>
        <input value={d.name} onChange={(e) => patch({ name: e.target.value })}
          className="w-full bg-app-text/5 border border-app-border rounded-md px-2 py-1.5 outline-none focus:border-accent/50" />
      </label>

      <div className="space-y-1">
        <span className="text-muted text-xs">Kind</span>
        <div className="flex gap-1">
          {(['compare', 'blend', 'freeform'] as CowriteKind[]).map(k => (
            <button key={k} onClick={() => patch({ kind: k })}
              className={cn('flex-1 flex items-center justify-center gap-1 text-[11px] py-1 rounded-md border',
                d.kind === k ? 'border-accent bg-accent/10 text-accent font-bold' : 'border-app-border hover:bg-app-text/5')}>
              {KIND_ICON[k]}{KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">Default reference (last N messages)</span>
        <input type="number" min={0} max={50} value={d.referenceLastN}
          onChange={(e) => patch({ referenceLastN: Math.max(0, Math.min(50, parseInt(e.target.value, 10) || 0)) })}
          className="w-20 bg-app-text/5 border border-app-border rounded-md px-2 py-1 outline-none focus:border-accent/50" />
      </label>

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">Prompt for an anchored passage</span>
        <input type="checkbox" checked={d.useAnchor} onChange={(e) => patch({ useAnchor: e.target.checked })}
          className="accent-[var(--app-accent)] w-4 h-4" />
      </label>

      <label className="block text-xs space-y-1">
        <span className="text-muted">Instruction (the ask, placed last)</span>
        <textarea rows={4} value={d.instruction} onChange={(e) => patch({ instruction: e.target.value })}
          className="w-full resize-y bg-app-text/5 border border-app-border rounded-md px-2 py-1.5 outline-none focus:border-accent/50" />
      </label>

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-1.5 rounded-md border border-app-border text-xs hover:bg-app-text/5">Cancel</button>
        <button onClick={() => onSave(d)} disabled={!d.name.trim()} className="flex-1 py-1.5 rounded-md bg-accent text-white text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-1">
          <Check size={13} /> Save
        </button>
      </div>
    </div>
  );
};
