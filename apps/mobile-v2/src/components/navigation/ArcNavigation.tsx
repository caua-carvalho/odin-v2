/**
 * ODIN V2 — Arc Navigation.
 *
 * Semicircular radial navigator for the six ODIN modules. The user drags along
 * the arc to select a module; each selection triggers a haptic pulse and a
 * contextual transition (delegated to the caller).
 *
 * Geometry:
 *  - Semicircular arc centred on the Command Center hub.
 *  - Modules placed at equal angular spacing along the arc.
 *  - Active module highlighted; adjacent modules semi-visible.
 */

import React from 'react';
import { View, StyleSheet, Text, type StyleProp, type ViewStyle, type GestureResponderEvent } from 'react-native';
import { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme/global-theme';
import { colors } from '../../theme/colors';
import { Card, VStack, HStack, TextCenter, SafePadded } from '../primitives';

export interface ArcModule {
  id: string;
  label: string;
  /** Leading icon name (expo/vector-icons). */
  icon: keyof typeof Ionicons.glyphMap;
  /** Secondary descriptor */
  hint?: string;
}

interface ArcNavigationProps {
  modules: ArcModule[];
  activeModuleId: string;
  onSelect: (moduleId: string) => void;
  /** Reduced motion (accessibility) */
  reducedMotion?: boolean;
  /** Optional wrapper style */
  style?: StyleProp<ViewStyle>;
  /** Hub content (e.g. Central Core) */
  children?: React.ReactNode;
}

const ARC_RADIUS = 96;
const ARC_CENTER = 160;
const ARC_DEPTH = 28; // radial thickness of arc segments
const MODULE_SPACING = 0.55; // fraction of semicircle for each module

/** Convert an angle (radians, clockwise from the top) to an arc position. */
function angleToPosition(angle: number): { x: number; y: number } {
  const x = ARC_CENTER + ARC_RADIUS * Math.sin(angle) * 1.0;
  const y = ARC_CENTER + ARC_RADIUS * (1 - Math.cos(angle));
  return { x, y };
}

export const ArcNavigation: React.FC<ArcNavigationProps> = ({
  modules,
  activeModuleId,
  onSelect,
  reducedMotion = false,
  style,
  children,
}) => {
  const activeIndex = modules.findIndex((m) => m.id === activeModuleId);
  const count = modules.length;

  // Angular position of each module (0..PI radian span).
  const moduleAngles = modules.map((_, i) => {
    const t = i / Math.max(count - 1, 1);
    return t * Math.PI * MODULE_SPACING;
  });

  // Shared rotation: user drags along the arc.
  const dragAngle = useSharedValue(0);
  const selectedSegment = useSharedValue(activeIndex);

  // Clamp to the arc span around the active module.
  const angleMin = Math.max(0, selectedSegment.value - 0.6);
  const angleMax = Math.min(Math.PI, selectedSegment.value + 0.6);

  // Horizontal pan gesture along the arc.
  const panGesture = Gesture.Pan()
    .onStart(() => {
      if (!reducedMotion) {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* noop */ }
      }
    })
    .onUpdate((event) => {
      const step = (Math.PI / Math.max(count - 1, 1)) * MODULE_SPACING * 0.55;
      const newAngle = Math.max(angleMin, Math.min(angleMax, dragAngle.value + (event.translationX ?? 0) * 0.012));
      dragAngle.value = newAngle;
    })
    .onEnd(() => {
      const nearest = Math.round((dragAngle.value % Math.PI) / (Math.PI / Math.max(count - 1, 1)));
      const clamped = Math.max(0, Math.min(count - 1, nearest));
      if (clamped !== activeIndex && !reducedMotion) {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* noop */ }
      }
      selectedSegment.value = clamped;
      onSelect(modules[clamped]?.id ?? '');
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${dragAngle.value}rad` }],
      opacity: 1,
    };
  });

  return (
    <SafePadded style={[styles.root, style]}>
      {children && <View style={styles.hub}>{children}</View>}

      {/* Arc track with module segments */}
      <View style={styles.arcTrack}>
        {modules.map((module, i) => {
          const angle = moduleAngles[i] ?? 0;
          const position = angleToPosition(angle);
          const active = i === selectedSegment.value;
          return (
            <View
              key={module.id}
              style={[
                styles.moduleSegment,
                {
                  left: position.x - 64,
                  top: position.y - 32,
                  width: 128,
                  height: ARC_DEPTH,
                  backgroundColor: active ? colors.primary : colors.border,
                  borderRadius: theme.radius.sm,
                  transform: [{ rotate: `${angle}rad` }],
                },
              ]}
            >
              <View style={[styles.segmentThumb, active && styles.segmentThumbActive]}>
                <Ionicons name={module.icon} size={14} color={active ? 'white' : 'faint'} />
              </View>
            </View>
          );
        })}
      </View>

      {/* Selection knob */}
      <View style={styles.knobWrap}>
        <GestureDetector gesture={panGesture}>
          <View
            style={[
              styles.knob,
              { backgroundColor: colors.primary, opacity: dragAngle.value === 0 ? 0.95 : 0.7 },
            ]}
          >
            <Ionicons name={modules[selectedSegment.value]?.icon} size={16} color="white" />
          </View>
        </GestureDetector>
      </View>
    </SafePadded>
  );
};

const styles = StyleSheet.create({
  root: {
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
  },
  hub: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  arcTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moduleSegment: {
    position: 'absolute',
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentThumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentThumbActive: {
    backgroundColor: theme.colors.primary,
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  knobWrap: {
    position: 'absolute',
    bottom: -40,
    alignItems: 'center',
  },
  knob: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
});
