import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { accentHex, resolveTheme } from '../themes';
import { specForTheme, startLiving } from '../utils/livingBackground';

/**
 * A full-screen, non-interactive canvas that animates a subtle particle field
 * chosen to suit the current theme. Sits behind the reading column (and the
 * scene atmosphere), and only runs when the user has turned on both effects and
 * the living background — and never when the OS asks to reduce motion.
 */
export const LivingBackground = () => {
  const enabled = useAppStore(s => s.livingBackground);
  const themeEffects = useAppStore(s => s.themeEffects);
  const theme = useAppStore(s => s.theme);
  const accentColor = useAppStore(s => s.accentColor);
  const bgColor = useAppStore(s => s.bgColor);
  const textColor = useAppStore(s => s.textColor);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const on = enabled && themeEffects;

  useEffect(() => {
    if (!on) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const themeDef = resolveTheme(theme, bgColor, textColor);
    const accent = accentHex(accentColor) || themeDef.vars.accent;
    const spec = specForTheme(theme, themeDef.isDark, accent);
    return startLiving(canvas, spec);
  }, [on, theme, accentColor, bgColor, textColor]);

  if (!on) return null;
  return (
    <canvas
      ref={canvasRef}
      className="living-bg fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden
    />
  );
};
