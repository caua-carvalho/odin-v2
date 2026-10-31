/**
 * ODIN V2 — Design tokens: typography.
 *
 * Sans-serif display + monospace for logs/metrics. Readable at any density.
 */

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'black';
export type FontFamily = 'inter' | 'jetbrains-mono';

export const fontFamily: Record<FontFamily, string> = {
  inter: 'Inter',
  'jetbrains-mono': 'JetBrains Mono',
};

export type RNFontWeight =
  | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
  | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900"
  | "normal" | "bold" | "ultralight" | "thin" | "light" | "medium" | "regular" | "semibold" | "condensedBold" | "condensed" | "heavy" | "black";

export const fontWeight: Record<FontWeight, RNFontWeight> = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 800,
};

export const fontSizes = {
  display: 48,
  heading: 30,
  subheading: 22,
  body: 17,
  bodySm: 15,
  caption: 13,
  captionSm: 11,
  mono: 15,
} as const;

export const lineHeight = {
  display: 56,
  heading: 38,
  body: 24,
  caption: 16,
  mono: 20,
} as const;

export const letterSpacing: Record<string, number> = {
  display: 0.2,
  heading: 0.1,
  body: 0.2,
  caption: 0.4,
  mono: 0.2,
};
