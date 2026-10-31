/** ODIN V2 — Primitives: common layout components.

 * Tiny, typed, single-responsibility building blocks.
 * Follows MOBILE_DESIGN_SYSTEM.md section 7 (components/primitives).
 */

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
  type PressableProps,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { theme, type RNFontWeight, type Theme } from '../../theme/global-theme';
import { alpha, colors } from '../../theme/colors';

/** Full-bleed background surface. */
export const Surface: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ children, style }) => <View style={[styles.surface, style]}>{children}</View>;

/** Card (raised surface, discrete border). */
export const Card: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ children, style }) => <View style={[styles.card, style]}>{children}</View>;

/** Safe-area padded container. */
export const SafePadded: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ children, style }) => (
  <View style={[styles.padded, style]}>
    <View style={{ flex: 1 }}>{children}</View>
  </View>
);

/** Vertical stack with consistent gap. */
export const VStack: React.FC<{
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
}> = ({ children, gap = 12, style, alignItems = 'flex-start' }) => (
  <View style={[styles.stack, { gap }, { alignItems }]}>{children}</View>
);

/** Horizontal stack with consistent gap. */
export const HStack: React.FC<{
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between';
}> = ({ children, gap = 12, style, justifyContent = 'flex-start' }) => (
  <View style={[styles.hstack, { gap }, { justifyContent }]}>{children}</View>
);

/** Centered text block (for headers, labels). */
export const TextCenter: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  size?: keyof typeof theme.fontSizes;
  fontWeight?: RNFontWeight;
  color?: keyof Theme['colors'];
}> = ({ children, style, size = 'body', fontWeight, color = 'text' }) => (
  <Text
    style={[
      styles.text,
      { fontSize: theme.fontSizes[size] },
      fontWeight && { fontWeight },
      { color: theme.colors[color] },
      style,
    ]}
  >
    {children}
  </Text>
);

// ---------------------------------------------------------------------------
// Content primitives (design system section 7)
// ---------------------------------------------------------------------------

/** Status/badges with tone. */
export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'cyan' | 'primary';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  accessibleLabel?: string;
}

const toneMap = {
  success: { dot: colors.success, bg: alpha(colors.success, 0.12), text: colors.successLight },
  warning: { dot: colors.warning, bg: alpha(colors.warning, 0.12), text: colors.warningLight },
  danger: { dot: colors.danger, bg: alpha(colors.danger, 0.12), text: colors.dangerLight },
  neutral: { dot: colors.muted, bg: alpha(colors.elevated, 0.8), text: colors.textSoft },
  cyan: { dot: colors.cyan, bg: alpha(colors.cyan, 0.12), text: colors.cyanDeep },
  primary: { dot: colors.primary, bg: alpha(colors.primary, 0.14), text: colors.primaryLight },
} as const;

export const Badge: React.FC<BadgeProps> = ({ label, tone = 'neutral', dot = false, icon, size = 'md', style, accessibleLabel }) => {
  const t = toneMap[tone];
  return (
    <View
      style={[
        styles.badge,
        size === 'sm' && styles.badgeSm,
        { backgroundColor: t.bg },
        style,
      ]}
      accessibilityLabel={accessibleLabel ?? label}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: t.dot }]} /> : null}
      {icon ? <Ionicons name={icon} size={size === 'sm' ? 11 : 12} color={t.text} /> : null}
      <Text
        style={[
          styles.badgeText,
          size === 'sm' && styles.badgeTextSm,
          { color: t.text },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
};

/** Raised content panel with optional glow border. */
export interface PanelProps {
  children: React.ReactNode;
  glow?: 'orange' | 'cyan' | 'none';
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

export const Panel: React.FC<PanelProps> = ({ children, glow = 'none', style, padded = true }) => (
  <View
    style={[
      styles.panel,
      padded && styles.panelPadded,
      glow !== 'none' && {
        borderColor: alpha(glow === 'cyan' ? colors.cyan : colors.orange, 0.4),
      },
      style,
    ]}
  >
    <View pointerEvents="none" style={styles.panelTopLine} />
    {children}
  </View>
);

/** Pressable with scale feedback + optional press colour. */
interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: 'light' | 'medium' | 'selection' | 'none';
  accessibleLabel?: string;
  hitSlop?: number;
}

export const PressableScale: React.FC<PressableScaleProps> = ({
  children,
  onPress,
  onLongPress,
  disabled = false,
  busy = false,
  style,
  haptic = 'selection',
  accessibleLabel,
  hitSlop,
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const fireHaptic = () => {
    if (haptic === 'none') return;
    const p = haptic === 'light'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : haptic === 'medium'
        ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        : Haptics.selectionAsync();
    void p.catch(() => undefined);
  };

  return (
    <Animated.View style={[styles.pressable, animatedStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibleLabel}
        hitSlop={hitSlop}
        disabled={disabled || busy}
        onPressIn={() => {
          if (!disabled && !busy) scale.value = withSpring(0.96, { damping: 18, stiffness: 320 });
        }}
        onPressOut={() => {
          if (!disabled && !busy) scale.value = withSpring(1, { damping: 16, stiffness: 260 });
        }}
        onPress={disabled || busy ? undefined : () => {
          fireHaptic();
          onPress?.();
        }}
        onLongPress={disabled || busy ? undefined : () => {
          fireHaptic();
          onLongPress?.();
        }}
        style={({ pressed }) => [
          styles.pressableInner,
          disabled && { opacity: 0.42 },
          pressed && !disabled && { opacity: 0.88 },
          style,
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
};

/** Section header with title + optional leading/trailing content. */
export interface SectionLabelProps {
  title: string;
  right?: React.ReactNode;
  level?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}

export const SectionLabel: React.FC<SectionLabelProps> = ({ title, right, level = 'md', style }) => (
  <View style={[styles.sectionLabel, level === 'sm' && styles.sectionLabelSm, level === 'lg' && styles.sectionLabelLg, style]}>
    <View style={styles.sectionLabelLeft}>
      <TextCenter
        size={level === 'sm' ? 'captionSm' : level === 'lg' ? 'body' : 'bodySm'}
        fontWeight="semibold"
        color="primary"
      >
        {title}
      </TextCenter>
    </View>
    {right ? <View style={styles.sectionLabelRight}>{right}</View> : null}
  </View>
);

/** Small stat tile (label + value + tone). */
export interface StatTileProps {
  label: string;
  value: string | number;
  tone?: BadgeTone;
}

export const StatTile: React.FC<StatTileProps> = ({ label, value, tone = 'neutral' }) => {
  const toneBg = tone === 'neutral' ? colors.elevated : colors[tone];
  return (
    <View style={styles.statTile}>
      <TextCenter size="captionSm" fontWeight="medium" color="muted" style={styles.statTileLabel}>
        {label}
      </TextCenter>
      <TextCenter size="heading" fontWeight="black" color="text" style={styles.statTileValue}>
        {value}
      </TextCenter>
      <View style={[styles.statTileTone, { backgroundColor: alpha(toneBg, 0.16) }]} />
    </View>
  );
};

/** Empty-state block (no data yet). */
export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <View style={styles.emptyState}>
    {icon ? <TextCenter size="display" fontWeight="black" color="muted">{icon}</TextCenter> : null}
    <TextCenter size="body" fontWeight="semibold" color="text" style={styles.emptyStateTitle}>{title}</TextCenter>
    {description ? <TextCenter size="bodySm" color="muted" style={styles.emptyStateDesc}>{description}</TextCenter> : null}
    {action ? <View style={styles.emptyStateAction}>{action}</View> : null}
  </View>
);

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  padded: {
    paddingBottom: 20,
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  stack: { flexDirection: 'column' },
  hstack: { flexDirection: 'row' },
  text: {
    fontFamily: theme.fontFamily.inter,
  },
  pressable: {
    flex: 1,
  },
  pressableInner: {
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  badgeSm: {
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: theme.fontSizes.captionSm,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0.2,
  },
  badgeTextSm: {
    fontSize: theme.fontSizes.caption,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  panel: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  panelPadded: {
    padding: theme.spacing.md,
  },
  panelTopLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  sectionLabelSm: {
    paddingVertical: theme.spacing.xxs,
  },
  sectionLabelLg: {
    paddingVertical: theme.spacing.sm,
  },
  sectionLabelLeft: {
    flex: 1,
  },
  sectionLabelRight: {
    flex: 0,
    alignItems: 'flex-end',
  },
  statTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  statTileLabel: {
    maxWidth: 80,
  },
  statTileValue: {
    minWidth: 36,
  },
  statTileTone: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  emptyStateTitle: {
    marginTop: theme.spacing.xs,
  },
  emptyStateDesc: {
    textAlign: 'center',
    maxWidth: 240,
  },
  emptyStateAction: {
    marginTop: theme.spacing.md,
  },
});
