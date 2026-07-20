import React, { useEffect, useRef } from 'react';
import { SceneFxKind, specForFx, startLiving } from '../utils/livingBackground';

/**
 * Director-called particle weather (smoke, fog, sparkles, snow…) rendered on
 * a canvas overlay in the Stage / VN scene. Asset-free — the same Canvas 2D
 * engine as the living backgrounds, denser and scoped to the scene box.
 * The caller gates on themeEffects; reduced-motion is honored here.
 */
export const SceneFx = ({ fx }: { fx?: SceneFxKind }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !fx) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    return startLiving(canvas, specForFx(fx));
  }, [fx]);

  if (!fx) return null;
  return (
    <canvas
      ref={ref}
      className="scene-fx"
      aria-hidden="true"
      data-fx={fx}
    />
  );
};
