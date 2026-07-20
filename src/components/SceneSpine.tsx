import React from 'react';
import { useAppStore } from '../store';
import { Scene } from '../utils/sceneSegment';
import { MOOD_COLOR } from '../utils/sceneMood';

/**
 * The scene spine — a slim vertical tick-bar down the left edge, one tick per
 * SCENE, tinted by its mood and sized by its length, with the current scene
 * marked. Clicking a tick jumps the reader to that scene's opening passage. It's
 * the structure a chat log never had: chapters, derived. Idle-faint and
 * unobtrusive (reader first); it brightens on hover.
 */
export const SceneSpine = ({
  scenes, activeSceneId,
}: {
  scenes: Scene[];
  activeSceneId?: string;
}) => {
  const jump = useAppStore(s => s.jumpToMessage);
  if (scenes.length < 2) return null;

  return (
    <nav className="scene-spine" aria-label="Scene navigator">
      {scenes.map((s, i) => {
        const active = s.id === activeSceneId;
        const label = `Scene ${i + 1}`
          + (s.mood !== 'neutral' ? ` · ${s.mood}` : '')
          + (s.location ? ` · ${s.location}` : '');
        return (
          <button
            key={s.id}
            type="button"
            data-active={active || undefined}
            style={{ flexGrow: s.messageIds.length, '--spine-c': MOOD_COLOR[s.mood] } as React.CSSProperties}
            onClick={() => jump(s.startId)}
            title={label}
            aria-label={`Jump to ${label}`}
            aria-current={active ? 'true' : undefined}
          />
        );
      })}
    </nav>
  );
};
