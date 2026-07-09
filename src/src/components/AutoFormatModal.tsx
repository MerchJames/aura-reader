import React, { useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronUp, Download, Eye, EyeOff, Plus, Trash2, Upload, X,
} from 'lucide-react';
import { useAppStore } from '../store';
import { AutoFormatRule, RuleTarget } from '../types';
import { RULE_PRESETS, SAMPLE_TEXT } from '../utils/rulePresets';
import { processText, ruleError } from '../utils/textProcessor';
import { downloadText } from '../utils/exporter';
import { cn } from '../utils/cn';

const newRuleId = () => Math.random().toString(36).substring(2, 9);

const TARGET_OPTIONS: { value: RuleTarget; label: string }[] = [
  { value: 'all', label: 'All messages' },
  { value: 'ai', label: 'AI only' },
  { value: 'user', label: 'User only' },
];

const RuleEditor = ({
  rule, index, total,
}: {
  rule: AutoFormatRule;
  index: number;
  total: number;
}) => {
  const store = useAppStore();
  const error = ruleError(rule);

  return (
    <div className={cn(
      'p-4 rounded-xl border bg-app-text/5 space-y-3',
      error ? 'border-red-500/50' : 'border-app-border',
    )}>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={(e) => store.updateAutoFormatRule(rule.id, { enabled: e.target.checked })}
          title="Enable rule"
        />
        <input
          value={rule.label ?? ''}
          placeholder="Rule name…"
          onChange={(e) => store.updateAutoFormatRule(rule.id, { label: e.target.value })}
          className="flex-1 bg-transparent font-bold text-sm outline-none placeholder:opacity-40 min-w-0"
        />
        <select
          value={rule.appliesTo ?? 'all'}
          onChange={(e) => store.updateAutoFormatRule(rule.id, { appliesTo: e.target.value as RuleTarget })}
          className="text-xs bg-app-text/5 border border-app-border rounded px-1.5 py-1 outline-none"
        >
          {TARGET_OPTIONS.map(o => (
            <option key={o.value} value={o.value} className="text-black bg-white">{o.label}</option>
          ))}
        </select>
        <div className="flex flex-col">
          <button
            onClick={() => store.moveAutoFormatRule(rule.id, -1)}
            disabled={index === 0}
            className="opacity-50 hover:opacity-100 disabled:opacity-15"
            title="Move up (rules run top to bottom)"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => store.moveAutoFormatRule(rule.id, 1)}
            disabled={index === total - 1}
            className="opacity-50 hover:opacity-100 disabled:opacity-15"
            title="Move down"
          >
            <ChevronDown size={14} />
          </button>
        </div>
        <button
          onClick={() => store.removeAutoFormatRule(rule.id)}
          className="text-red-500 p-1.5 hover:bg-red-500/10 rounded"
          title="Delete rule"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="grid grid-cols-[1fr_5rem] sm:grid-cols-[3fr_4rem_3fr] gap-2 items-end">
        <div className="min-w-0">
          <label className="text-xs text-muted mb-1 block">Find (regex)</label>
          <input
            value={rule.pattern}
            onChange={(e) => store.updateAutoFormatRule(rule.id, { pattern: e.target.value })}
            className="w-full bg-app-bg border border-app-border rounded px-2 py-1 text-sm font-mono"
            spellCheck={false}
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Flags</label>
          <input
            value={rule.flags ?? 'g'}
            onChange={(e) => store.updateAutoFormatRule(rule.id, { flags: e.target.value })}
            className="w-full bg-app-bg border border-app-border rounded px-2 py-1 text-sm font-mono"
            placeholder="g"
            spellCheck={false}
          />
        </div>
        <div className="col-span-2 sm:col-span-1 min-w-0">
          <label className="text-xs text-muted mb-1 block">Replace with ($1, $2…)</label>
          <input
            value={rule.replacement}
            onChange={(e) => store.updateAutoFormatRule(rule.id, { replacement: e.target.value })}
            className="w-full bg-app-bg border border-app-border rounded px-2 py-1 text-sm font-mono"
            spellCheck={false}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

export const AutoFormatModal = ({ onClose }: { onClose: () => void }) => {
  const store = useAppStore();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [importError, setImportError] = useState('');

  const defaultSample = useMemo(() => {
    const firstAi = store.currentStory?.messages.find(m => m.role === 'ai');
    return firstAi ? firstAi.content.slice(0, 400) : SAMPLE_TEXT;
  }, [store.currentStory]);
  const [sample, setSample] = useState(defaultSample);

  const preview = useMemo(
    () => processText(sample, {
      hideMetadata: store.hideMetadata,
      autoFormat: true,
      autoFormatRules: store.autoFormatRules,
      paragraphSpacing: store.paragraphSpacing,
      dialogueOwnLine: store.dialogueOwnLine,
      smartTypography: store.smartTypography,
      styleQuotes: store.styleQuotes,
      substituteNames: store.substituteNames,
      characterName: store.currentStory?.characterName ?? 'Elara',
      userName: store.currentStory?.userName ?? 'James',
      role: 'ai',
    }).processedText,
    [sample, store],
  );

  const addBlankRule = () =>
    store.addAutoFormatRule({
      id: newRuleId(), label: '', pattern: '', flags: 'g', replacement: '',
      appliesTo: 'all', enabled: true,
    });

  const addPreset = (presetIndex: number) => {
    const preset = RULE_PRESETS[presetIndex];
    store.addAutoFormatRule({ ...preset, id: newRuleId(), enabled: true });
    setShowPresets(false);
  };

  const exportRules = () =>
    downloadText('aura-reader-rules.json', JSON.stringify(store.autoFormatRules, null, 2));

  const importRules = async (file: File) => {
    setImportError('');
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error('not an array');
      const rules: AutoFormatRule[] = parsed
        .filter((r: any) => r && typeof r.pattern === 'string' && typeof r.replacement === 'string')
        .map((r: any) => ({
          id: typeof r.id === 'string' ? r.id : newRuleId(),
          label: typeof r.label === 'string' ? r.label : undefined,
          pattern: r.pattern,
          flags: typeof r.flags === 'string' ? r.flags : 'g',
          replacement: r.replacement,
          appliesTo: ['all', 'ai', 'user'].includes(r.appliesTo) ? r.appliesTo : 'all',
          enabled: r.enabled !== false,
        }));
      if (rules.length === 0) throw new Error('no valid rules found');
      store.importAutoFormatRules(rules);
    } catch (e: any) {
      setImportError(`Import failed: ${e?.message ?? 'invalid file'}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface text-app-text rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl border border-app-border">
        <div className="flex items-center justify-between p-5 border-b border-app-border">
          <div>
            <h2 className="text-xl font-bold">Auto-Formatter Rules</h2>
            <p className="text-sm text-muted">
              Regex find &amp; replace, applied top to bottom while Auto-Format is on.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="file"
              accept=".json"
              ref={importInputRef}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importRules(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              title="Import rules (.json)"
              className="p-2 hover:bg-app-text/10 rounded-lg transition-colors"
            >
              <Upload size={17} />
            </button>
            <button
              onClick={exportRules}
              title="Export rules (.json)"
              disabled={store.autoFormatRules.length === 0}
              className="p-2 hover:bg-app-text/10 rounded-lg transition-colors disabled:opacity-30"
            >
              <Download size={17} />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-app-text/10 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {importError && <p className="text-sm text-red-500">{importError}</p>}

          <div className="flex items-center gap-2">
            <button
              onClick={addBlankRule}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90"
            >
              <Plus size={15} /> New rule
            </button>
            <div className="relative">
              <button
                onClick={() => setShowPresets(!showPresets)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-app-border text-sm hover:bg-app-text/5"
              >
                Add preset <ChevronDown size={14} />
              </button>
              {showPresets && (
                <div className="absolute left-0 top-full mt-1 z-10 w-80 max-h-72 overflow-y-auto rounded-xl border border-app-border bg-surface shadow-2xl p-1">
                  {RULE_PRESETS.map((preset, i) => (
                    <button
                      key={preset.label}
                      onClick={() => addPreset(i)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-app-text/5"
                    >
                      <span className="block text-sm font-bold">{preset.label}</span>
                      <span className="block text-xs text-muted">{preset.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!store.autoFormat && (
              <span className="text-xs text-amber-500 ml-auto">
                Auto-Format is currently off — rules won't run.
              </span>
            )}
          </div>

          {store.autoFormatRules.length === 0 ? (
            <p className="text-sm text-muted italic">
              No rules yet. Add a preset to see how they work.
            </p>
          ) : (
            <div className="space-y-3">
              {store.autoFormatRules.map((rule, i) => (
                <RuleEditor key={rule.id} rule={rule} index={i} total={store.autoFormatRules.length} />
              ))}
            </div>
          )}

          <div className="border-t border-app-border pt-4">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted mb-3"
            >
              {showPreview ? <EyeOff size={14} /> : <Eye size={14} />} Live preview
            </button>
            {showPreview && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">Sample input</label>
                  <textarea
                    value={sample}
                    onChange={(e) => setSample(e.target.value)}
                    rows={8}
                    spellCheck={false}
                    className="w-full bg-app-bg border border-app-border rounded-lg p-2.5 text-xs font-mono resize-y"
                  />
                </div>
                <div className="min-w-0">
                  <label className="text-xs text-muted mb-1 block">
                    Result (with current text settings)
                  </label>
                  <pre className="w-full h-[calc(100%-1.25rem)] min-h-40 bg-app-bg border border-app-border rounded-lg p-2.5 text-xs font-mono whitespace-pre-wrap overflow-y-auto">
                    {preview}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
