import React from 'react';
import { Scene, tensionAt } from '../utils/sceneSegment';
import { sceneAtmosphere } from '../utils/sceneMood';

/**
 * The visible half of the scene engine — a stack of assetless, non-interactive
 * overlays that dress the reading surface for the SCENE the reader is in:
 *
 *  · mood wash        — a colour tint (holds across the span, eases at edges)
 *  · time-of-day light — warm sky at dawn/dusk, cool at night
 *  · desaturating veil — melancholy scenes lose a little colour
 *  · grain            — a faint shimmer for eerie scenes
 *  · vignette         — tense/ominous scenes darken at the edges and close in
 *
 * Every layer sits BEHIND the text (z-0) so readability is never touched, and
 * all of it disappears under the `no-effects` toggle. Nothing renders for a
 * plain neutral scene.
 */
export const SceneAtmosphere = ({
  scene, activeId, enabled,
}: {
  scene?: Scene;
  activeId?: string;
  enabled: boolean;
}) => {
  if (!enabled || !scene) return null;
  const a = sceneAtmosphere(scene.mood, tensionAt(scene, activeId), scene.timeOfDay);
  if (!a.washOpacity && !a.vignette && !a.lightOpacity && !a.veil && !a.grain) return null;

  return (
    <>
      {a.lightOpacity > 0 && a.lightColor && (
        <div
          className="scene-light"
          style={{ opacity: a.lightOpacity, '--light-color': a.lightColor } as React.CSSProperties}
          aria-hidden
        />
      )}
      {a.washOpacity > 0 && (
        <div className="scene-wash" data-mood={scene.mood} style={{ opacity: a.washOpacity }} aria-hidden />
      )}
      {a.veil > 0 && <div className="scene-veil" style={{ opacity: a.veil }} aria-hidden />}
      {a.grain && <div className="scene-grain" aria-hidden />}
      {a.vignette > 0 && (
        <div className="scene-vignette" style={{ '--vig': a.vignette } as React.CSSProperties} aria-hidden />
      )}
    </>
  );
};
