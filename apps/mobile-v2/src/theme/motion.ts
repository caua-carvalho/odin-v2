/**
 * ODIN V2 — Design tokens: motion.
 *
 * Curated easing curves + duration scales. No arbitrary React-driven updates.
 */

export const easing = {
  smooth: (v: number) => {
    // CSS ease-out-cubic equivalent: 0.4, 0, 0.2, 1
    const a = 0.4;
    const b = 0.2;
    const c = 1 - a;
    return 1 - Math.pow(1 - v, 3) - a * Math.pow(v, 3) * c;
  },
  deceleration: (v: number) => {
    // ease-in-quad reversed for deceleration feel
    return 1 - Math.pow(1 - v, 2);
  },
  spring: (v: number) => {
    // custom spring curve (overshoot)
    const k = 2.5;
    return 1 - Math.pow(1 - v, 2) * (1 + k * v);
  },
  rigid: (v: number) => {
    // ease-in-out cubic
    return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
  },
} as const;

export const duration = {
  instant: 120,
  fast: 200,
  normal: 300,
  slow: 450,
  pause: 700,
} as const;

export const curve = {
  enter: easing.smooth,
  exit: easing.deceleration,
  pop: easing.spring,
  snap: easing.rigid,
} as const;
