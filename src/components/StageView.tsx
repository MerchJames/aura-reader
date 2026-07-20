import React, { useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store';
import { useAuraV2Store } from '../stores/useAuraV2Store';
import { resolveContent } from '../utils/lens';
import { useScenes } from '../hooks/useScenes';
import { useSceneDirector } from '../hooks/useSceneDirector';
import { SceneAtmosphere } from './SceneAtmosphere';
import { SceneSpine } from './SceneSpine';
import { processText, balanceEmphasis, truncateToWord } from '../utils/textProcessor';
import { renderInline } from '../utils/bookLayout';
import { MOOD_COLOR, sceneAtmosphere } from '../utils/sceneMood';
import { bucketFor } from '../lib/spriteStorage';
import { spriteFor, useSpriteStore } from '../stores/useSpriteStore';
import { backdropForScene, useBackdropStore } from '../stores/useBackdropStore';
import { SceneFx } from './SceneFx';
import { Message, SceneEmphasis } from '../types';
import { cn } from '../utils/cn';

/**
 * Render a paragraph with the Director's emphasis spans woven in: the
 * verbatim substrings are fenced with private-use markers BEFORE the inline
 * markdown pass (so escaping can't break the match) and swapped for styled
 * spans after. Whispers shrink, shouts swell, beats pulse.
 */
export const renderWithEmphasis = (
  para: string,
  emphasis: SceneEmphasis[] | undefined,
  images: boolean,
): string => {
  if (!emphasis?.length) return renderInline(para, { images });
  let marked = para;
  const used: number[] = [];
  emphasis.forEach((e, i) => {
    if (!e.text || !marked.includes(e.text)) return;
    marked = marked.replace(e.text, `\uE010${i}\uE011${e.text}\uE014${i}\uE015`);
    used.push(i);
  });
  let html = renderInline(marked, { images });
  for (const i of used) {
    html = html
      .replace(`\uE010${i}\uE011`, `<span class="stage-emk-${emphasis[i].kind}">`)
      .replace(`\uE014${i}\uE015`, '</span>');
  }
  return html;
};

/**
 * Stage view — the story as a visual-novel / RPG scene (design cues from
 * classic VN engines; all code original). The two leads stand on stage as
 * portraits; whoever is speaking is IN FOCUS (bright, forward) while the
 * other waits in shadow. Their current spoken line pops as a speech bubble
 * over the portrait, and the FULL passage streams into the big textbox at
 * the bottom, JRPG style. Themes dress the stage: RPG Quest, Pixel RPG,
 * Pixel Chat, and Snek Comms each restyle box/portraits/bubble.
 */

/**
 * The line currently being spoken: the LAST quoted span in the text, still
 * open (mid-sentence while streaming) or just closed. Null when narration.
 */
export const latestDialogue = (text: string): string | null => {
  let open = -1;
  let last: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '“') open = i + 1;
    else if (c === '”') {
      if (open >= 0) { last = text.slice(open, i); open = -1; }
    } else if (c === '"') {
      if (open >= 0) { last = text.slice(open, i); open = -1; }
      else open = i + 1;
    }
  }
  if (open >= 0 && open < text.length) last = text.slice(open);
  // The bubble shows spoken words only — markdown markers stay in the box.
  const t = last?.replace(/[*_`]/g, '').trim();
  return t ? t : null;
};

/**
 * Director-driven portrait reactions: the speaker's read emotion animates
 * the focused portrait (anger shakes, joy bounces...) and — when the reader
 * has uploaded an expression set for the character — swaps the sprite too.
 */
export const reactionFor = (emotion?: string): string | null => {
  const bucket = bucketFor(emotion);
  return bucket === 'neutral' ? null : `stage-em-${bucket}`;
};

const Portrait = ({
  avatar, name, active, side, reaction,
}: {
  avatar?: string; name: string; active: boolean; side: 'left' | 'right';
  reaction?: string | null;
}) => (
  <div
    className={cn(
      'stage-portrait', `stage-portrait-${side}`,
      active ? 'stage-focus' : 'stage-dim',
      active && reaction,
    )}
  >
    {avatar ? (
      <img src={avatar} alt={name} draggable={false} />
    ) : (
      <div className="stage-portrait-fallback">{(name[0] ?? '?').toUpperCase()}</div>
    )}
  </div>
);

export const StageView = () => {
  const store = useAppStore();
  const v2 = useAuraV2Store();
  const storyId = store.currentStory?.id;
  const overrides = storyId ? v2.overridesByStory[storyId] : undefined;
  const lensOn = !!storyId && !!v2.lensOnByStory[storyId];
  useSceneDirector();
  const { scenes, active: scene, activeId: activeSceneId } = useScenes();

  // The passage on stage: the streaming message, else the last one read.
  const current: Message | undefined =
    store.streamingMessage ?? store.visibleMessages[store.visibleMessages.length - 1];
  const isUser = current?.role === 'user';

  const rawText = store.streamingMessage
    ? balanceEmphasis(truncateToWord(store.streamedText))
    : current
      ? processText(resolveContent(current, overrides, lensOn), {
          hideMetadata: store.hideMetadata && !current.hidden,
          oocHandling: store.oocHandling,
          autoFormat: store.autoFormat,
          autoFormatRules: store.autoFormatRules,
          paragraphSpacing: store.paragraphSpacing,
          smartTypography: store.smartTypography,
          substituteNames: store.substituteNames,
          characterName: store.currentStory?.characterName,
          userName: store.currentStory?.userName,
          styleQuotes: false,
          role: current.role,
        }).processedText
      : '';

  // Images never render inside the textbox — they belong ON the stage (CG).
  // The Director's whisper/shout/beat spans are woven into the words (the
  // Stage is a performance, so emphasis is always on here).
  const emphasis = storyId && current
    ? v2.sceneByStory[storyId]?.[current.id]?.emphasis
    : undefined;
  const bodyHtml = useMemo(
    () => rawText
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${renderWithEmphasis(p, emphasis, false)}</p>`)
      .join(''),
    [rawText, emphasis],
  );

  // The stage CG: like a VN, the most recent image (attached OR inline in
  // the prose) takes center stage and STAYS until a newer one replaces it.
  const sceneImages = useMemo(() => {
    if (!store.showImages) return [] as string[];
    const INLINE_IMG = /!\[[^\]]*\]\(([^)\s]+)\)/g;
    const imagesOf = (m: Message): string[] => [
      ...(m.images ?? []),
      ...[...m.content.matchAll(INLINE_IMG)].map(match => match[1]),
    ];
    const timeline = [...store.visibleMessages, ...(store.streamingMessage ? [store.streamingMessage] : [])];
    for (let i = timeline.length - 1; i >= 0; i--) {
      const imgs = imagesOf(timeline[i]);
      if (imgs.length > 0) return imgs;
    }
    return [] as string[];
  }, [store.showImages, store.visibleMessages, store.streamingMessage]);
  const [lightbox, setLightbox] = React.useState<string | null>(null);

  // The Director's read of the passage animates the speaker (when effects on)
  // and picks the character's expression sprite when one is uploaded.
  const descriptor = storyId && current ? v2.sceneByStory[storyId]?.[current.id] : undefined;
  const reaction = store.themeEffects ? reactionFor(descriptor?.speaker?.emotion) : null;
  const bucket = bucketFor(descriptor?.speaker?.emotion);
  const sprites = useSpriteStore(s => s.sprites);
  const spriteUrls = useSpriteStore(s => s.urls);

  // The scene's location dresses the stage (keyword-matched backdrop).
  const backdrops = useBackdropStore(s => s.backdrops);
  const backdropUrls = useBackdropStore(s => s.urls);
  const backdrop = store.showImages
    ? backdropForScene(scene?.location, scene?.mood, backdrops, backdropUrls)
    : null;

  // The scene's mood reaches the stage itself (glow + tinted chrome).
  const atmo = scene ? sceneAtmosphere(scene.mood, scene.tensionById[scene.endId] ?? scene.peakTension, scene.timeOfDay) : null;
  const tintVars = (store.sceneTheming && store.themeEffects && scene && atmo
    ? { '--scene-tint': MOOD_COLOR[scene.mood], '--scene-tint-a': String(atmo.washOpacity) }
    : {}) as React.CSSProperties;

  const dialogue = useMemo(() => latestDialogue(rawText), [rawText]);

  // Portrait sources — the story's lead on the left, the reader on the right.
  const story = store.currentStory;
  const aiName = !current || isUser
    ? (story?.characterName ?? 'Story')
    : current.name;
  const aiAvatar = (!isUser ? current?.avatar : undefined)
    ?? story?.characterAvatars?.[aiName]
    ?? story?.characterAvatar
    ?? story?.avatar;
  const userName = story?.userName ?? 'You';
  const userAvatar = story?.userAvatar;

  // Keep the textbox pinned to the newest line while it streams.
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bodyHtml]);

  const togglePlay = () => store.setIsStreaming(!store.isStreaming);

  const atmosphereOn = store.sceneTheming && store.themeEffects;

  if (store.chains.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center opacity-50">
        <p className="text-lg">This story is empty.</p>
      </div>
    );
  }

  const aiSprite = spriteFor(aiName, !isUser ? bucket : 'neutral', sprites, spriteUrls);
  // The reader's own sprites live ONLY under the namespaced key — a plain-name
  // fallback here can collide with a character set when names overlap.
  const userSprite = spriteFor(`user:${userName}`, isUser ? bucket : 'neutral', sprites, spriteUrls);

  return (
    <div className="stage relative z-10 flex-1 min-h-0 flex flex-col" style={tintVars}>
      <SceneAtmosphere scene={scene} activeId={activeSceneId} enabled={atmosphereOn} />
      {store.sceneTheming && <SceneSpine scenes={scenes} activeSceneId={scene?.id} />}

      {/* The stage: both leads stand here; the speaker takes the light. */}
      <div className="stage-scene relative flex-1 min-h-0">
        {backdrop && (
          <div key={backdrop.id} className="stage-backdrop" aria-hidden="true">
            <img src={backdrop.url} alt="" />
          </div>
        )}
        {/* Director-called particle weather for this passage. */}
        {store.themeEffects && <SceneFx fx={descriptor?.fx} />}
        {/* RPG HUD (game themes only, via CSS): the Director's read on screen. */}
        {scene && (
          <div className="stage-hud" aria-hidden="true">
            <span className="stage-hud-scene">Scene {scene.index + 1}</span>
            {scene.location && <span className="stage-hud-loc">{scene.location}</span>}
            <span className="stage-hud-mood">{scene.mood}</span>
            <div
              className="stage-hud-tension"
              title="Scene tension"
            >
              <i style={{ width: `${Math.round((scene.tensionById[current?.id ?? ''] ?? scene.peakTension) * 100)}%` }} />
            </div>
          </div>
        )}
        {/* Keyed per passage so the emotion animation replays on every line,
            not only when the reaction class happens to change. */}
        <Portrait
          key={`l-${current?.id ?? 'x'}-${reaction ?? ''}`}
          avatar={aiSprite ?? aiAvatar} name={aiName} active={!isUser} side="left" reaction={reaction}
        />
        <Portrait
          key={`r-${current?.id ?? 'x'}-${reaction ?? ''}`}
          avatar={userSprite ?? userAvatar} name={userName} active={isUser} side="right" reaction={reaction}
        />

        {sceneImages.length > 0 && (
          <div className="stage-cg" onClick={() => setLightbox(sceneImages[0])}>
            <img src={sceneImages[0]} alt="" loading="lazy" referrerPolicy="no-referrer" />
            {sceneImages.length > 1 && (
              <span className="stage-cg-count">+{sceneImages.length - 1}</span>
            )}
          </div>
        )}

        {dialogue && (
          <div
            key={`${current?.id}-${dialogue.length < 8 ? dialogue : ''}`}
            className={cn('stage-bubble', isUser ? 'stage-bubble-right' : 'stage-bubble-left')}
          >
            {dialogue}
          </div>
        )}
      </div>

      {/* The main textbox: the whole passage, streamed. Click = play/pause. */}
      <div className="stage-boxwrap shrink-0 px-4 pb-36 pt-1">
        <div
          className={cn('stage-box relative mx-auto w-full', isUser && 'stage-box-cmd')}
          onClick={togglePlay}
        >
          <div className="stage-nameplate">{current?.name ?? '…'}</div>
          <div
            ref={boxRef}
            className="stage-text markdown-body"
            style={{ fontSize: `${store.fontSize}px` }}
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
          {store.isStreaming && <span className="stage-cursor" aria-hidden="true">▼</span>}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </div>
  );
};
