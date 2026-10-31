/**
 * ODIN V2 — Design tokens: colors.
 *
 * Palette: grafite + orange identity + cyan secondary instrument.
 * Dark-first HUD identity, inspired by J.A.R.V.I.S./Tony Stark but original.
 */

export const colors = {
  // -- Background / surfaces (grafite + graphite)
  bg: '#090D12',
  surface: '#0C1118',
  elevated: '#111924',
  raised: '#161E2C',

  // -- Borders / dividers
  border: '#1A232F',
  borderBright: '#24303D',

  // -- Text
  text: '#F1F4F7',
  textSoft: '#C4CCD4',
  muted: '#8E98A5',
  dim: '#647080',
  faint: '#424C59',

  // -- Identity (orange)
  primary: '#F28B32',
  primaryLight: '#FFD18A',
  primaryDark: '#D96F1E',

  white: '#FFFFFF',

  // -- Secondary instrument (cyan)
  cyan: '#52C7D9',
  cyanDeep: '#1F8F9E',
  cyanSoft: '#1E3A40',

  // -- Semantic
  success: '#35B77A',
  warning: '#E9AE45',
  danger: '#E45C5C',
  info: '#7BB3FF',

  // -- Muted / decorative
  deco: '#27313C',

  // -- Identity glow tints (light variants for badges/dots)
  orange: '#F28B32',
  successLight: '#5DE898',
  warningLight: '#F0BE4B',
  dangerLight: '#E86868',
} as const;

/** Parse `#RRGGBB` -> `rgba(r, g, b, opacity)` */
export function alpha(hex: string, opacity: number): string {
  const normalized = hex.replace('#', '');
  const value =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized;
  const int = Number.parseInt(value, 16);
  if (Number.isNaN(int)) return `rgba(255,255,255,${opacity})`;
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${opacity})`;
}

/** Linear interpolation between two hex colors. */
export function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string): [number, number, number] => {
    const int = Number.parseInt(hex.replace('#', ''), 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}
