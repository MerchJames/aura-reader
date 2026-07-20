import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { useAuraV2Store } from '../stores/useAuraV2Store';
import { resolveContent } from '../utils/lens';
import { useScenes } from '../hooks/useScenes';
import { useSceneDirector } from '../hooks/useSceneDirector';
import { SceneAtmosphere } from './SceneAtmosphere';
import { processText, balanceEmphasis, truncateToWord } from '../utils/textProcessor';
import { MOOD_COLOR, sceneAtmosphere } from '../utils/sceneMood';
import { bucketFor } from '../lib/spriteStorage';
import { spriteFor, useSpriteStore } from '../stores/useSpriteStore';
import { backdropForScene, useBackdropStore } from '../stores/useBackdropStore';
import { latestDialogue, reactionFor, renderWithEmphasis } from './StageView';
import { SceneFx } from './SceneFx';
import { Message } from '../types';
import { cn } from '../utils/cn';

/**
 * Visual Novel mode — the story as a full-bleed staged scene (its own mode,
 * distinct from the RPG-flavored Stage; presentation ideas after classic VN
 * engines, all code original). The area backdrop fills the screen and
 * announces itself with a title card when the story moves somewhere new; the
 * ACTIVE speaker's sprite stands in focus with a slow camera push-in while
 * they speak; high tension closes cinematic letterbox bars; the dialogue box
 * floats over the scene, VN style.
 */
export const VNView = () => {
  const store = useAppStore();
  const v2 = useAuraV2Store();
  const storyId = store.currentStory?.id;
  const overrides = storyId ? v2.overridesByStory[storyId] : undefined;
  const lensOn = !!storyId && !!v2.lensOnByStory[storyId];
  useSceneDirector();
  const { active: scene, activeId: activeSceneId } = useScenes();

  const current: Message | undefined =
    store.streamingMessage ?? store.visibleMessages[store.visibleMessages.length - 1];
  const isUser = current?.role === 'user';
  const story = store.currentStory;

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
          characterName: story?.characterName,
          userName: story?.userName,
          styleQuotes: false,
          role: current.role,
        }).processedText
      : '';

  const descriptor = storyId && current ? v2.sceneByStory[storyId]?.[current.id] : undefined;
  const emphasis = descriptor?.emphasis;
  const bucket = bucketFor(descriptor?.speaker?.emotion);

  // ADV-style box, like a real VN (and like the RPG / Text Message feel the
  // reader asked for): the CURRENT BEAT only — the spoken line front and
  // center, the narration around it as a quiet band. Falls back to the
  // latest narration paragraph when nobody is speaking.
  const dialogue = useMemo(() => latestDialogue(rawText), [rawText]);
  const beat = useMemo(() => {
    const paras = rawText.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    const lastPara = paras[paras.length - 1] ?? '';
    if (!dialogue) {
      return { primary: lastPara, primaryIsSpeech: false, aside: null as string | null };
    }
    // Narration living in the same paragraph as the speech becomes the aside.
    const aside = lastPara.includes(dialogue)
      ? lastPara.replace(dialogue, '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim()
      : null;
    return { primary: dialogue, primaryIsSpeech: true, aside: aside || null };
  }, [rawText, dialogue]);

  const primaryHtml = useMemo(
    () => renderWithEmphasis(beat.primary, emphasis, false),
    [beat.primary, emphasis],
  );

  // ----- the cast on stage --------------------------------------------------
  // The character HOLDS the scene (dimmed while the reader speaks — never a
  // bare stage during user turns); the reader joins beside them when they
  // have a sprite or picture of their own. Whoever speaks takes the light.
  const speakerName = current?.name ?? story?.characterName ?? 'Story';
  const sprites = useSpriteStore(s => s.sprites);
  const spriteUrls = useSpriteStore(s => s.urls);

  const charName = useMemo(() => {
    if (current && !isUser) return current.name;
    for (let i = store.visibleMessages.length - 1; i >= 0; i--) {
      const m = store.visibleMessages[i];
      if (m.role !== 'user') return m.name;
    }
    return story?.characterName ?? 'Story';
  }, [current, isUser, store.visibleMessages, story?.characterName]);

  const charSprite = spriteFor(charName, !isUser ? bucket : 'neutral', sprites, spriteUrls);
  const charPortrait = charSprite
    ?? (!isUser ? current?.avatar : undefined)
    ?? story?.characterAvatars?.[charName]
    ?? story?.characterAvatar
    ?? story?.avatar;
  const userSprite = spriteFor(
    `user:${story?.userName ?? 'You'}`, isUser ? bucket : 'neutral', sprites, spriteUrls);
  const userPortrait = userSprite ?? story?.userAvatar;
  const bothOnStage = !!charPortrait && !!userPortrait;

  // ----- the area (backdrop + title card) ----------------------------------
  const backdrops = useBackdropStore(s => s.backdrops);
  const backdropUrls = useBackdropStore(s => s.urls);
  const backdrop = store.showImages
    ? backdropForScene(scene?.location, scene?.mood, backdrops, backdropUrls)
    : null;

  const [areaCard, setAreaCard] = useState<string | null>(null);
  const lastAreaRef = useRef<string | null>(null);
  useEffect(() => {
    const area = scene?.location ?? null;
    if (!area || area === lastAreaRef.current) return;
    lastAreaRef.current = area;
    setAreaCard(area);
    const t = setTimeout(() => setAreaCard(null), 2600);
    return () => clearTimeout(t);
  }, [scene?.location]);

  // ----- cinematics ---------------------------------------------------------
  const tension = scene
    ? (scene.tensionById[current?.id ?? ''] ?? scene.peakTension)
    : 0;
  const letterbox = store.themeEffects && tension >= 0.72;

  const atmo = scene
    ? sceneAtmosphere(scene.mood, tension, scene.timeOfDay)
    : null;
  const tintVars = (store.sceneTheming && store.themeEffects && scene && atmo
    ? { '--scene-tint': MOOD_COLOR[scene.mood], '--scene-tint-a': String(atmo.washOpacity) }
    : {}) as React.CSSProperties;

  const atmosphereOn = store.sceneTheming && store.themeEffects;
  const [lightbox, setLightbox] = useState<string | null>(null);

  // The most recent image stays on scene as a CG (VN persistence).
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

  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [primaryHtml]);

  const reaction = store.themeEffects ? reactionFor(descriptor?.speaker?.emotion) : null;

  if (store.chains.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center opacity-50">
        <p className="text-lg">This story is empty.</p>
      </div>
    );
  }

  return (
    <div className="vn relative z-10 flex-1 min-h-0 overflow-hidden" style={tintVars}>
      <SceneAtmosphere scene={scene} activeId={activeSceneId} enabled={atmosphereOn} />

      {/* The area. */}
      {backdrop && (
        <div key={backdrop.id} className="vn-backdrop" aria-hidden="true">
          <img src={backdrop.url} alt="" />
        </div>
      )}
      <div className="vn-wash" aria-hidden="true" />

      {/* Director-called particle weather rides above the backdrop. */}
      {store.themeEffects && <SceneFx fx={descriptor?.fx} />}

      {/* The camera: pushes in slowly while the speaker performs. */}
      <div className={cn('vn-camera', store.isStreaming && 'vn-speaking')}>
        {charPortrait && (
          <div
            key={`c-${current?.id ?? 'x'}-${charSprite ? bucket : 'av'}`}
            className={cn(
              'vn-sprite',
              bothOnStage ? 'vn-sprite-left' : 'vn-sprite-solo',
              isUser && 'vn-dim',
            )}
          >
            {/* Reaction rides the IMG — the wrapper's centering transform
                must never be overridden by the emotion keyframes. */}
            <img
              src={charPortrait} alt={charName} draggable={false}
              className={cn(!isUser && reaction)}
            />
          </div>
        )}
        {userPortrait && (
          <div
            key={`u-${current?.id ?? 'x'}-${userSprite ? bucket : 'av'}`}
            className={cn(
              'vn-sprite vn-sprite-user',
              bothOnStage ? 'vn-sprite-right' : 'vn-sprite-solo',
              !isUser && 'vn-dim',
            )}
          >
            <img
              src={userPortrait} alt={story?.userName ?? 'You'} draggable={false}
              className={cn(isUser && reaction)}
            />
          </div>
        )}
      </div>

      {sceneImages.length > 0 && (
        <div className="vn-cg" onClick={() => setLightbox(sceneImages[0])}>
          <img src={sceneImages[0]} alt="" loading="lazy" referrerPolicy="no-referrer" />
        </div>
      )}

      {/* Area title card. */}
      {areaCard && <div className="vn-area">{areaCard}</div>}

      {/* Cinematic letterbox under high tension. */}
      <div className={cn('vn-bar vn-bar-top', letterbox && 'vn-bar-on')} aria-hidden="true" />
      <div className={cn('vn-bar vn-bar-bottom', letterbox && 'vn-bar-on')} aria-hidden="true" />

      {/* The dialogue box floats over the scene. */}
      <div className="vn-boxwrap">
        <div
          className="vn-box"
          onClick={() => store.setIsStreaming(!store.isStreaming)}
        >
          {beat.primaryIsSpeech && <div className="vn-name">{speakerName}</div>}
          {beat.aside && <div className="vn-aside">{beat.aside}</div>}
          <div
            ref={boxRef}
            className={cn('vn-text markdown-body', !beat.primaryIsSpeech && 'vn-narration')}
            style={{ fontSize: `${store.fontSize}px` }}
            dangerouslySetInnerHTML={{ __html: primaryHtml }}
          />
          {store.isStreaming && <span className="vn-cursor" aria-hidden="true">▼</span>}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg shadow-2xl object-contain" referrerPolicy="no-referrer" />
        </div>
      )}
    </div>
  );
};
