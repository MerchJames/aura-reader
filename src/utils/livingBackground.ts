/**
 * Living background — a subtle, asset-free Canvas 2D particle field that makes a
 * theme feel alive (drifting motes, rising embers, falling petals, twinkling
 * stars, soft rain). Deliberately low-density and low-opacity: it's ambience
 * behind the reading column, never a distraction. Canvas 2D (not WebGL) so it
 * runs on almost anything; the caller gates it on the effects + reduced-motion
 * settings.
 */

export type LivingMode =
  | 'motes' | 'embers' | 'petals' | 'stars' | 'rain'
  | 'fog' | 'smoke' | 'sparkles' | 'snow';

export interface LivingSpec {
  mode: LivingMode;
  /** Particle colour (hex). */
  color: string;
  /** Roughly how many particles (scaled a little by viewport area). */
  count: number;
  /** Base speed multiplier. */
  speed: number;
}

/** Pick a fitting ambience for a theme. Falls back to gentle motes in the accent. */
export const specForTheme = (themeId: string, isDark: boolean, accent: string): LivingSpec => {
  switch (themeId) {
    case 'sakura': return { mode: 'petals', color: '#f7a8c4', count: 34, speed: 1 };
    case 'forest': return { mode: 'motes', color: '#8fe3a2', count: 42, speed: 0.6 };
    case 'ocean': return { mode: 'embers', color: '#67e8d2', count: 30, speed: 0.5 };
    case 'synthwave': return { mode: 'stars', color: '#f0abfc', count: 90, speed: 1 };
    case 'rpg': return { mode: 'stars', color: '#ffd23f', count: 80, speed: 1.2 };
    case 'pixelrpg': return { mode: 'stars', color: '#c8d4f8', count: 85, speed: 1 };
    case 'pixelchat': return { mode: 'motes', color: '#4de3c1', count: 36, speed: 0.7 };
    case 'snek': return { mode: 'rain', color: '#2e5c38', count: 40, speed: 1.2 };
    case 'amoled':
    case 'dark': return { mode: 'stars', color: '#cbd5e1', count: 70, speed: 1 };
    case 'terminal':
    case 'hacker': return { mode: 'rain', color: '#4ade80', count: 55, speed: 2 };
    case 'parchment':
    case 'book':
    case 'sepia': return { mode: 'motes', color: '#bd925a', count: 32, speed: 0.5 };
    case 'vista':
    case 'ocean-2': return { mode: 'motes', color: accent || '#93c5fd', count: 40, speed: 0.6 };
    default: return { mode: 'motes', color: accent || '#94a3b8', count: isDark ? 56 : 34, speed: 0.6 };
  }
};

interface Particle { x: number; y: number; r: number; a: number; vx: number; vy: number; ph: number; }

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const v = parseInt(n || '888888', 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/**
 * Start the animation on a canvas; returns a stop() that cancels the loop and
 * detaches listeners. Safe to call repeatedly (each returns its own stopper).
 */
export const startLiving = (canvas: HTMLCanvasElement, spec: LivingSpec): (() => void) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const [cr, cg, cb] = hexToRgb(spec.color);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0, raf = 0, last = performance.now();
  const ps: Particle[] = [];
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);

  const spawn = (initial: boolean): Particle => {
    const base: Particle = { x: rnd(0, W), y: rnd(0, H), r: rnd(0.6, 2.2), a: rnd(0.15, 0.55), vx: 0, vy: 0, ph: rnd(0, Math.PI * 2) };
    if (spec.mode === 'embers') { base.vy = -rnd(0.15, 0.5) * spec.speed; base.vx = rnd(-0.1, 0.1); base.y = initial ? base.y : H + 8; }
    else if (spec.mode === 'fog' || spec.mode === 'smoke') {
      base.r = rnd(50, 130); base.a = rnd(0.03, 0.09);
      base.vx = rnd(0.05, 0.2) * spec.speed * (Math.random() < 0.5 ? -1 : 1);
      base.vy = spec.mode === 'smoke' ? -rnd(0.05, 0.16) * spec.speed : rnd(-0.02, 0.02);
      if (!initial) { base.x = base.vx > 0 ? -base.r : W + base.r; base.y = rnd(H * 0.2, H); }
    }
    else if (spec.mode === 'sparkles') { base.r = rnd(0.7, 1.9); base.a = rnd(0.35, 0.8); base.vy = -rnd(0.05, 0.2) * spec.speed; base.vx = rnd(-0.08, 0.08); }
    else if (spec.mode === 'snow') { base.vy = rnd(0.25, 0.75) * spec.speed; base.vx = rnd(-0.15, 0.15); base.r = rnd(1, 2.6); base.a = rnd(0.25, 0.7); base.y = initial ? base.y : -8; }
    else if (spec.mode === 'petals') { base.vy = rnd(0.25, 0.7) * spec.speed; base.vx = rnd(-0.25, 0.25); base.r = rnd(1.4, 3); base.y = initial ? base.y : -8; }
    else if (spec.mode === 'rain') { base.vy = rnd(3, 6) * spec.speed; base.r = rnd(0.5, 1); base.a = rnd(0.1, 0.28); base.y = initial ? base.y : -12; }
    else if (spec.mode === 'stars') { base.vx = 0; base.vy = 0; base.r = rnd(0.5, 1.6); }
    else { base.vx = rnd(-0.15, 0.15) * spec.speed; base.vy = rnd(-0.12, 0.12) * spec.speed; } // motes
    return base;
  };

  const resize = () => {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.round(spec.count * Math.min(1.6, Math.max(0.5, (W * H) / (1280 * 800))));
    ps.length = 0;
    for (let i = 0; i < target; i++) ps.push(spawn(true));
  };

  const frame = (t: number) => {
    const dt = Math.min(50, t - last) / 16.67;
    last = t;
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      if (spec.mode === 'stars') {
        p.ph += 0.02 * dt;
        const a = p.a * (0.5 + 0.5 * Math.sin(p.ph));
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      p.ph += 0.03 * dt;
      const wobble = spec.mode === 'motes' || spec.mode === 'petals' || spec.mode === 'snow';
      p.x += (p.vx + (wobble ? Math.sin(p.ph) * 0.15 : 0)) * dt;
      p.y += p.vy * dt;
      // Recycle off-screen particles.
      if ((spec.mode === 'embers' || spec.mode === 'smoke' || spec.mode === 'sparkles') && p.y < -p.r - 8) Object.assign(p, spawn(false));
      else if ((spec.mode === 'petals' || spec.mode === 'rain' || spec.mode === 'snow') && p.y > H + 12) Object.assign(p, spawn(false));
      else if ((spec.mode === 'fog' || spec.mode === 'smoke') && (p.x < -p.r * 1.5 || p.x > W + p.r * 1.5)) Object.assign(p, spawn(false));
      else if (spec.mode === 'motes') { if (p.x < -8) p.x = W + 8; if (p.x > W + 8) p.x = -8; if (p.y < -8) p.y = H + 8; if (p.y > H + 8) p.y = -8; }

      if (spec.mode === 'fog' || spec.mode === 'smoke') {
        const breathe = 0.75 + 0.25 * Math.sin(p.ph * 0.4);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(${cr},${cg},${cb},${p.a * breathe})`);
        g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      if (spec.mode === 'sparkles') {
        const tw = Math.max(0, Math.sin(p.ph * 3));
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${p.a * tw})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.7 + 0.5 * tw), 0, Math.PI * 2); ctx.fill();
        continue;
      }

      const flick = spec.mode === 'embers' ? 0.6 + 0.4 * Math.sin(p.ph * 2) : 1;
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${p.a * flick})`;
      if (spec.mode === 'rain') {
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = p.r;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + 6 + p.vy); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    raf = requestAnimationFrame(frame);
  };

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
};


/* ------------------------------------------------------------------ */
/* Director special FX — per-passage particle weather.                 */
/* ------------------------------------------------------------------ */

export const SCENE_FX = [
  'smoke', 'fog', 'stars', 'sparkles', 'rain', 'embers', 'snow', 'petals',
] as const;
export type SceneFxKind = (typeof SCENE_FX)[number];

/** Particle spec for a Director-called effect (denser than theme ambience). */
export const specForFx = (fx: SceneFxKind): LivingSpec => {
  switch (fx) {
    case 'smoke': return { mode: 'smoke', color: '#8d93a8', count: 14, speed: 1 };
    case 'fog': return { mode: 'fog', color: '#aeb6c4', count: 16, speed: 0.7 };
    case 'stars': return { mode: 'stars', color: '#dfe6ff', count: 110, speed: 1 };
    case 'sparkles': return { mode: 'sparkles', color: '#ffe9a8', count: 60, speed: 1 };
    case 'rain': return { mode: 'rain', color: '#9db8d8', count: 80, speed: 1.6 };
    case 'embers': return { mode: 'embers', color: '#ff9a4a', count: 46, speed: 1.1 };
    case 'snow': return { mode: 'snow', color: '#eef4ff', count: 70, speed: 0.9 };
    case 'petals': return { mode: 'petals', color: '#f7a8c4', count: 44, speed: 1 };
  }
};
