import React, { useState } from 'react';
import {
  AlignLeft, Download, FileText, Focus, ImageIcon, LayoutTemplate, MessageSquareQuote,
  PauseCircle, PlayCircle, Quote, Save, Sparkles, Terminal, Trash2, Type, UserRound,
  Volume2, X, ZoomIn,
} from 'lucide-react';
import { useAppStore } from '../store';
import { ttsSupported, useVoices } from '../hooks/useTTS';
import { ACCENTS, THEMES } from '../themes';
import { downloadText, safeFilename, storyToMarkdown } from '../utils/exporter';
import { cn } from '../utils/cn';

const readImageFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

/** Upload / preview / clear one profile picture. */
const AvatarUpload = ({
  label, value, onPick,
}: {
  label: string;
  value?: string;
  onPick: (dataUrl: string | undefined) => void;
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        onClick={() => inputRef.current?.click()}
        className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-app-border bg-app-text/10 flex items-center justify-center shrink-0 hover:ring-accent transition"
        title={`Set ${label} picture`}
      >
        {value
          ? <img src={value} alt={label} className="w-full h-full object-cover" />
          : <UserRound size={16} className="opacity-60" />}
      </button>
      <span className="flex-1">{label}</span>
      {value && (
        <button onClick={() => onPick(undefined)} className="text-xs text-muted hover:text-red-500">
          Remove
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onPick(await readImageFile(f));
          e.target.value = '';
        }}
      />
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <label className="text-xs font-bold uppercase tracking-wider text-muted mb-2 block">
      {title}
    </label>
    <div className="flex flex-col gap-2">{children}</div>
  </div>
);

const Toggle = ({
  icon, label, value, onChange, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  accent?: boolean;
}) => (
  <button
    onClick={() => onChange(!value)}
    className={cn(
      'flex items-center justify-between p-2 rounded-lg hover:bg-app-text/5 transition-colors text-sm',
      accent && 'font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10',
    )}
  >
    <div className="flex items-center gap-2">{icon}<span>{label}</span></div>
    <span className={cn(
      'w-9 h-5 rounded-full p-0.5 transition-colors',
      value ? 'bg-accent' : 'bg-app-text/20',
    )}>
      <span className={cn(
        'block w-4 h-4 rounded-full bg-white shadow transition-transform',
        value && 'translate-x-4',
      )} />
    </span>
  </button>
);

const SelectRow = ({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) => (
  <div className="flex gap-2 items-center text-sm">
    <span className="w-24 shrink-0">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 bg-app-text/5 border border-app-border rounded-md px-2 py-1.5 outline-none min-w-0"
    >
      {options.map(o => (
        <option key={o.value} value={o.value} className="text-black bg-white">
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

export const SettingsPanel = ({ onOpenAutoFormat }: { onOpenAutoFormat: () => void }) => {
  const store = useAppStore();
  const [configName, setConfigName] = useState('');
  const voices = useVoices();

  if (!store.settingsOpen) return null;

  const close = () => store.setSettingsOpen(false);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={close} />

      <div className="absolute right-0 top-0 h-full w-full max-w-sm bg-surface text-app-text border-l border-app-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
          <h2 className="text-lg font-bold">Settings</h2>
          <button onClick={close} className="p-2 rounded-full hover:bg-app-text/10 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <Section title="Appearance">
            <SelectRow
              label="Theme"
              value={store.theme}
              onChange={(v) => store.setTheme(v as any)}
              options={Object.values(THEMES).map(t => ({ value: t.id, label: t.label }))}
            />
            {store.theme === 'custom' && (
              <div className="flex gap-3 items-center text-sm pl-24 ml-2">
                <label className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={store.textColor}
                    onChange={(e) => store.setTextColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer"
                  />
                  Text
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={store.bgColor}
                    onChange={(e) => store.setBgColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer"
                  />
                  Background
                </label>
              </div>
            )}
            <div className="flex gap-2 items-start text-sm">
              <span className="w-24 shrink-0 pt-1">Accent</span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {ACCENTS.map(a => (
                  <button
                    key={a.id || 'theme'}
                    title={a.label}
                    onClick={() => store.setAccentColor(a.id)}
                    className={cn(
                      'w-6 h-6 rounded-full border transition-transform hover:scale-110',
                      store.accentColor === a.id ? 'ring-2 ring-offset-2 ring-offset-surface ring-app-text scale-110' : 'border-app-border',
                    )}
                    style={a.hex
                      ? { background: a.hex }
                      : { background: 'conic-gradient(from 0deg, #f43f5e, #f59e0b, #10b981, #0ea5e9, #8b5cf6, #f43f5e)' }}
                  />
                ))}
              </div>
            </div>
            <SelectRow
              label="Font"
              value={store.fontFamily}
              onChange={(v) => store.setFontFamily(v as any)}
              options={[
                { value: 'sans', label: 'Sans-serif' },
                { value: 'serif', label: 'Serif' },
                { value: 'mono', label: 'Monospace' },
                { value: 'slab', label: 'Slab Serif' },
                { value: 'rounded', label: 'Rounded' },
                { value: 'handwriting', label: 'Handwriting' },
                { value: 'typewriter', label: 'Typewriter' },
                { value: 'medieval', label: 'Medieval' },
                { value: 'comic', label: 'Comic' },
                { value: 'dyslexic', label: 'OpenDyslexic' },
              ]}
            />
            <div className="flex items-center gap-2 bg-app-text/5 px-3 rounded-lg justify-between py-1.5 text-sm">
              <span>Font Size</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => store.setFontSize(Math.max(12, store.fontSize - 1))}
                  className="w-6 h-6 rounded hover:bg-app-text/10"
                >
                  −
                </button>
                <span className="font-mono w-6 text-center">{store.fontSize}</span>
                <button
                  onClick={() => store.setFontSize(Math.min(32, store.fontSize + 1))}
                  className="w-6 h-6 rounded hover:bg-app-text/10"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1 bg-app-text/5 px-3 py-2 rounded-lg text-sm">
              <div className="flex justify-between items-center">
                <span>Content Width</span>
                <span className="font-mono text-xs opacity-70">
                  {store.contentWidth === 0 ? 'Default' : `${store.contentWidth}px`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1800}
                step={40}
                value={store.contentWidth}
                onChange={(e) => store.setContentWidth(Number(e.target.value))}
                className="w-full accent-accent"
              />
              <span className="text-[11px] text-muted">
                Widen the reading column (best on desktop). 0 = theme default.
              </span>
            </div>
            <Toggle
              icon={<Sparkles size={16} />}
              label="Ambient theme effects"
              value={store.themeEffects}
              onChange={store.setThemeEffects}
            />
          </Section>

          <Section title="Reveal Animation">
            <div className="grid grid-cols-4 gap-2">
              {(['typewriter', 'smooth', 'magic', 'fade'] as const).map(style => (
                <button
                  key={style}
                  onClick={() => store.setAnimationStyle(style)}
                  className={cn(
                    'py-1.5 text-xs rounded-md border capitalize transition-colors',
                    store.animationStyle === style
                      ? 'border-accent bg-accent/10 text-accent font-bold'
                      : 'border-transparent bg-app-text/5 hover:bg-app-text/10',
                  )}
                >
                  {style === 'typewriter' ? 'Typing' : style}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Reading">
            <Toggle
              icon={<Focus size={16} />}
              label="Autofocus Handsfree Mode"
              value={store.isAutofocusMode}
              onChange={store.setIsAutofocusMode}
              accent
            />
            {store.isAutofocusMode && (
              <div className="ml-4 pl-3 border-l border-app-border flex flex-col gap-1">
                <Toggle
                  icon={<ZoomIn size={15} />}
                  label="Auto-zoom on streaming text"
                  value={store.autofocusAutoZoom}
                  onChange={(v) => {
                    store.setAutofocusAutoZoom(v);
                    store.setAutofocusZoom(v ? 1.4 : 1);
                  }}
                />
                <div className="flex gap-2 items-center text-sm px-2 py-1">
                  <span className="w-20 shrink-0">Zoom</span>
                  <input
                    type="range" min="0.8" max="2.5" step="0.1"
                    value={store.autofocusZoom}
                    onChange={(e) => store.setAutofocusZoom(Number(e.target.value))}
                    className="flex-1 accent-[var(--app-accent)]"
                  />
                  <span className="font-mono w-10 text-right">{store.autofocusZoom.toFixed(1)}×</span>
                </div>
              </div>
            )}
            <Toggle
              icon={<PlayCircle size={16} />}
              label="Auto-Stream"
              value={store.autoStream}
              onChange={store.setAutoStream}
            />
            <Toggle
              icon={<LayoutTemplate size={16} />}
              label="Pagination (Book Pages)"
              value={store.layoutMode === 'paginated'}
              onChange={(v) => store.setLayoutMode(v ? 'paginated' : 'continuous')}
            />
            {store.layoutMode === 'paginated' && (
              <Toggle
                icon={<PauseCircle size={16} />}
                label="Stop at End of Page"
                value={store.pauseAtPageEnd}
                onChange={store.setPauseAtPageEnd}
              />
            )}
          </Section>

          <Section title="Autoreader">
            <div className="flex gap-2 items-center text-sm">
              <span className="w-24 shrink-0">Reveal</span>
              <div className="flex flex-1 bg-app-text/5 p-1 rounded-lg">
                {(['character', 'word'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => store.setRevealMode(mode)}
                    className={cn(
                      'flex-1 py-1 text-xs rounded-md transition-colors',
                      store.revealMode === mode
                        ? 'bg-surface shadow-sm text-accent font-bold'
                        : 'opacity-60 hover:opacity-100',
                    )}
                  >
                    {mode === 'character' ? 'By letter' : 'By word'}
                  </button>
                ))}
              </div>
            </div>
            <SelectRow
              label="Msg pause"
              value={String(store.messagePause)}
              onChange={(v) => store.setMessagePause(Number(v))}
              options={[
                { value: '0', label: 'None' },
                { value: '400', label: 'Short (0.4s)' },
                { value: '1000', label: 'Medium (1s)' },
                { value: '2000', label: 'Long (2s)' },
              ]}
            />
            {ttsSupported() && (
              <>
                <Toggle
                  icon={<Volume2 size={16} />}
                  label="Read Aloud (TTS)"
                  value={store.ttsEnabled}
                  onChange={store.setTtsEnabled}
                />
                {store.ttsEnabled && (
                  <>
                    <SelectRow
                      label="Voice"
                      value={store.ttsVoiceURI}
                      onChange={store.setTtsVoiceURI}
                      options={[
                        { value: '', label: 'System default' },
                        ...[...voices]
                          .sort((a, b) => {
                            const rank = (v: SpeechSynthesisVoice) =>
                              /natural|online|neural/i.test(v.name) ? 0 : v.localService ? 1 : 2;
                            return rank(a) - rank(b) || a.name.localeCompare(b.name);
                          })
                          .map(v => ({
                            value: v.voiceURI,
                            label: `${/natural|online|neural/i.test(v.name) ? '★ ' : ''}${v.name} (${v.lang})`,
                          })),
                      ]}
                    />
                    <Toggle
                      icon={<Volume2 size={15} />}
                      label="Match reading speed"
                      value={store.ttsFollowSpeed}
                      onChange={store.setTtsFollowSpeed}
                    />
                    <div className="flex gap-2 items-center text-sm">
                      <span className="w-24 shrink-0">Base rate</span>
                      <input
                        type="range" min="0.5" max="2" step="0.1"
                        value={store.ttsRate}
                        onChange={(e) => store.setTtsRate(Number(e.target.value))}
                        className="flex-1 accent-[var(--app-accent)]"
                      />
                      <span className="font-mono w-8 text-right">{store.ttsRate.toFixed(1)}×</span>
                    </div>
                    <div className="flex gap-2 items-center text-sm">
                      <span className="w-24 shrink-0">Pitch</span>
                      <input
                        type="range" min="0" max="2" step="0.1"
                        value={store.ttsPitch}
                        onChange={(e) => store.setTtsPitch(Number(e.target.value))}
                        className="flex-1 accent-[var(--app-accent)]"
                      />
                      <span className="font-mono w-8 text-right">{store.ttsPitch.toFixed(1)}</span>
                    </div>
                    <p className="text-[11px] text-muted leading-snug px-1">
                      ★ marks higher-quality "natural / online" voices. More voices come from your
                      OS — on Windows, add them in Settings → Time &amp; Language → Speech.
                    </p>
                  </>
                )}
              </>
            )}
          </Section>

          <Section title="Text Processing">
            <Toggle
              icon={<Sparkles size={16} />}
              label="Auto-Format"
              value={store.autoFormat}
              onChange={store.setAutoFormat}
            />
            {store.autoFormat && (
              <div className="ml-4 pl-3 border-l border-app-border flex flex-col gap-1">
                <Toggle
                  icon={<AlignLeft size={15} />}
                  label="Paragraph spacing"
                  value={store.paragraphSpacing}
                  onChange={store.setParagraphSpacing}
                />
                <Toggle
                  icon={<MessageSquareQuote size={15} />}
                  label="Dialogue on its own line"
                  value={store.dialogueOwnLine}
                  onChange={store.setDialogueOwnLine}
                />
                <Toggle
                  icon={<Type size={15} />}
                  label="Smart typography (… —)"
                  value={store.smartTypography}
                  onChange={store.setSmartTypography}
                />
              </div>
            )}
            <Toggle
              icon={<Quote size={16} />}
              label="Style Quoted Dialogue"
              value={store.styleQuotes}
              onChange={store.setStyleQuotes}
            />
            <Toggle
              icon={<UserRound size={16} />}
              label="Replace {{user}} / {{char}}"
              value={store.substituteNames}
              onChange={store.setSubstituteNames}
            />
            <Toggle
              icon={<ImageIcon size={16} />}
              label="Show Images"
              value={store.showImages}
              onChange={store.setShowImages}
            />
            <Toggle
              icon={<FileText size={16} />}
              label="Hide Metadata Tags"
              value={store.hideMetadata}
              onChange={store.setHideMetadata}
            />
            <SelectRow
              label="OOC asides"
              value={store.oocHandling}
              onChange={(v) => store.setOocHandling(v as any)}
              options={[
                { value: 'show', label: 'Show normally' },
                { value: 'dim', label: 'Dim (muted italic)' },
                { value: 'hide', label: 'Hide entirely' },
              ]}
            />
            <button
              onClick={() => { close(); onOpenAutoFormat(); }}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-app-text/5 transition-colors text-sm text-accent bg-accent/10"
            >
              <div className="flex items-center gap-2">
                <Terminal size={16} />
                <span>Custom Regex Rules</span>
              </div>
              <span>&rarr;</span>
            </button>
          </Section>

          <Section title="Dialogue Styling">
            <SelectRow
              label="Style"
              value={store.dialogueStyle}
              onChange={(v) => store.setDialogueStyle(v as any)}
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'italic', label: 'Italic' },
                { value: 'bold', label: 'Bold' },
                { value: 'bold-italic', label: 'Bold Italic' },
              ]}
            />
            <SelectRow
              label="Animation"
              value={store.dialogueAnimation}
              onChange={(v) => store.setDialogueAnimation(v as any)}
              options={[
                { value: 'none', label: 'None' },
                { value: 'zoom', label: 'Zoom' },
                { value: 'pulse', label: 'Pulse' },
                { value: 'wave', label: 'Wave' },
                { value: 'glow', label: 'Glow' },
                { value: 'rise', label: 'Rise' },
              ]}
            />
            <SelectRow
              label="Color"
              value={store.dialogueColor}
              onChange={store.setDialogueColor}
              options={[
                { value: 'text-indigo-600 dark:text-indigo-300', label: 'Indigo' },
                { value: 'text-rose-600 dark:text-rose-300', label: 'Rose' },
                { value: 'text-emerald-600 dark:text-emerald-300', label: 'Emerald' },
                { value: 'text-amber-600 dark:text-amber-300', label: 'Amber' },
                { value: 'text-sky-600 dark:text-sky-300', label: 'Sky' },
                { value: '', label: 'Match Theme' },
              ]}
            />
          </Section>

          {store.currentStory && (
            <Section title="Profile Pictures">
              <AvatarUpload
                label={store.currentStory.characterName || 'Character'}
                value={store.currentStory.characterAvatar ?? store.currentStory.avatar}
                onPick={(url) => store.setStoryAvatar('character', url)}
              />
              <AvatarUpload
                label={store.currentStory.userName || 'You'}
                value={store.currentStory.userAvatar}
                onPick={(url) => store.setStoryAvatar('user', url)}
              />
              <span className="text-[11px] text-muted">
                Shown beside messages in Chat &amp; Phone views. Saved with this story.
              </span>
            </Section>
          )}

          {store.theme === 'phone' && (
            <Section title="Phone View">
              <Toggle
                icon={<MessageSquareQuote size={16} />}
                label="Dialogue only (texting feel)"
                value={store.phoneDialogueOnly}
                onChange={store.setPhoneDialogueOnly}
              />
              <span className="text-[11px] text-muted">
                Hides narration and shows each spoken line as its own message bubble.
              </span>
            </Section>
          )}

          <Section title="Saved Configurations">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Config name…"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                className="flex-1 bg-app-text/5 border border-app-border rounded-md px-2 py-1.5 text-sm outline-none min-w-0"
              />
              <button
                onClick={() => {
                  if (configName.trim()) {
                    store.saveConfig(configName.trim());
                    setConfigName('');
                  }
                }}
                title="Save current settings"
                className="p-2 bg-accent text-white rounded-md hover:opacity-90"
              >
                <Save size={16} />
              </button>
            </div>
            {Object.keys(store.savedConfigs).map(name => (
              <div key={name} className="flex items-center gap-1">
                <button
                  onClick={() => store.loadConfig(name)}
                  className="flex-1 text-left px-2 py-1.5 text-sm hover:bg-app-text/5 rounded truncate"
                >
                  Load: <span className="font-bold">{name}</span>
                </button>
                <button
                  onClick={() => store.deleteConfig(name)}
                  className="p-1.5 text-red-500 hover:bg-red-500/10 rounded"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </Section>

          {store.currentStory && (
            <Section title="Export">
              <button
                onClick={() => {
                  const story = store.currentStory!;
                  downloadText(`${safeFilename(story.title)}.md`, storyToMarkdown(story));
                }}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-app-text/5 transition-colors text-sm"
              >
                <Download size={16} />
                <span>Export story as Markdown</span>
              </button>
            </Section>
          )}

          <div className="text-[11px] text-muted leading-relaxed border-t border-app-border pt-4">
            <p className="font-bold mb-1">Keyboard shortcuts</p>
            <p>Space — play/pause · ←/→ — turn pages · Q/E tap — slower/faster ·
            E hold — 3× boost · Q hold — rewind · In autofocus: W/S zoom, A/D pan,
            hold F + select text — highlight</p>
          </div>
        </div>
      </div>
    </div>
  );
};
