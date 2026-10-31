/**
 * ODIN V2 — Theme: combines all tokens.
 *
 * Used by the design system primitives and Central Core.
 */
import { colors } from './colors';
import { fontFamily, fontWeight, fontSizes, lineHeight, letterSpacing } from './typography';
import { spacing, radius } from './spacing';
import { easing, duration, curve } from './motion';

export const theme = {
  colors,
  fontFamily,
  fontWeight,
  fontSizes,
  lineHeight,
  letterSpacing,
  spacing,
  radius,
  easing,
  duration,
  curve,
};

export type Theme = typeof theme;
export type { RNFontWeight } from './typography';
