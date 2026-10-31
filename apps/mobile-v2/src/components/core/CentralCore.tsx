/**
 * ODIN V2 — Central Core.
 *
 * The primary visual element of the Command Center. A holographic orb whose
 * geometry, colour and motion reflect the agent's real operational state.
 *
 * States (per MOBILE_DESIGN_SYSTEM.md 5.x):
 *  Idle | Listening | Processing | Executing | Waiting Approval | Speaking | Error | Offline
 *
 * The component is pure presentational: it receives state + metrics via props.
 * No timers or randomness — every animation keyframed from a shared value fed
 * by the owning presentation layer.
 */

import React from 'react';
import { StyleSheet, View, Text, type ViewStyle, type StyleProp, type GestureResponderEvent } from 'react-native';
import { useSharedValue, useAnimatedStyle, withTiming, withRepeat } from 'react-native-reanimated';
import { Svg, Circle, RadialGradient, Stop, Defs } from 'react-native-svg';
import { colors, alpha, mixHex } from '../../theme/colors';
import { theme } from '../../theme/global-theme';
import { VStack, HStack, Card, TextCenter } from '../primitives';

export type CoreState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'executing'
  | 'waiting_approval'
  | 'speaking'
  | 'error'
  | 'offline';

export interface CoreMetrics {
  /** Agent display name (e.g. "ODIN") */
  agentName?: string;
  /** Model id, e.g. "gpt-oss-120b" */
  model?: string;
  /** Connection status text */
  connectivity?: string;
  /** Current task summary */
  task?: string;
  /** Runtime duration string (e.g. "03:24") */
  duration?: string;
}

interface CentralCoreProps {
  state: CoreState;
  metrics?: CoreMetrics;
  /** Optional press → drill into detail panel */
  onPress?: (state: CoreState) => void;
  /** Reduced motion preference (accessibility) */
  reducedMotion?: boolean;
  style?: StyleProp<ViewStyle>;
}

const stateConfig = {
  idle: {
    ring: colors.cyan,
    core: colors.cyan,
    label: 'Em prontidão',
    hint: 'Orientado e aguardando comando',
  },
  listening: {
    ring: colors.cyan,
    core: colors.cyanDeep,
    label: 'Escutando',
    hint: 'Capturando entrada de voz',
  },
  processing: {
    ring: colors.primary,
    core: colors.primary,
    label: 'Processando',
    hint: 'Raciocínio interno, sem expor detalhes',
  },
  executing: {
    ring: colors.primary,
    core: colors.primaryLight,
    label: 'Executando',
    hint: 'Tarefa ativa no backend',
  },
  waiting_approval: {
    ring: colors.warning,
    core: colors.warning,
    label: 'Autorização pendente',
    hint: 'Operação aguarda confirmação do utilizador',
  },
  speaking: {
    ring: colors.primaryLight,
    core: colors.primary,
    label: 'Respondendo',
    hint: 'Fluxo de resposta em andamento',
  },
  error: {
    ring: colors.danger,
    core: colors.danger,
    label: 'Falha',
    hint: 'Verifique a conexão ou o backend',
  },
  offline: {
    ring: colors.faint,
    core: colors.faint,
    label: 'Offline',
    hint: 'Sem conexão com o backend',
  },
} as const;

const X_AXIS = 50;
const Y_AXIS = 50;
const ORB_RADIUS = 46;
const OUTER_RADIUS = 56;

const ArcMarkers: React.FC<{ state: CoreState; reducedMotion?: boolean }> = ({ state, reducedMotion }) => {
  const config = stateConfig[state];
  const active = useSharedValue(1);

  if (reducedMotion) {
    return (
      <VStack gap={6}>
        <View style={[styles.marker, { backgroundColor: config.core }]} />
        <TextCenter size="captionSm" fontWeight="medium" color="muted">
          {config.label}
        </TextCenter>
      </VStack>
    );
  }

  // Animate a ring of ticks around the core; the active state's tick pulses.
  active.value = withRepeat(
    withTiming(0, { duration: 1600, easing: theme.curve.enter }),
    -1,
    true,
  );

  return (
    <View style={styles.markersWrap}>
      {/* Ring of tick marks (decorative) */}
      <View style={styles.markerRing}>
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * 2 * Math.PI;
          const x = X_AXIS + OUTER_RADIUS * Math.cos(angle);
          const y = Y_AXIS + OUTER_RADIUS * Math.sin(angle);
          return <View key={i} style={[styles.marker, { left: x, top: y, backgroundColor: i === 0 ? config.ring : colors.border }]} />;
        })}
      </View>
      {/* Active tick — moves as the state pulses */}
      <View
        style={[
          styles.activeTick,
          {
            width: active.value * 16,
            height: active.value * 16,
            backgroundColor: config.ring,
            borderRadius: active.value * 8,
          },
        ]}
      />
    </View>
  );
};

/** Small cluster of state indicator dots. */
export const CoreIndicators: React.FC<{ state: CoreState }> = ({ state }) => {
  const config = stateConfig[state];
  return (
    <HStack gap={4}>
      {(['idle', 'listening', 'processing', 'executing', 'speaking', 'error', 'offline'] as const).map((s) => {
        const cfg = stateConfig[s];
        const active = s === state;
        return (
          <View
            key={s}
            style={[
              styles.dot,
              { backgroundColor: active ? cfg.core : colors.border },
              active && styles.dotActive,
            ]}
          />
        );
      })}
    </HStack>
  );
};

interface CentralCoreEvents {
  onPress?: (state: CoreState) => void;
}

export const CentralCore: React.FC<CentralCoreProps & CentralCoreEvents> = ({
  state,
  metrics,
  onPress,
  reducedMotion = false,
  style,
}) => {
  const config = stateConfig[state];

  const pulse = useSharedValue(1);
  const spin = useSharedValue(0);

  if (!reducedMotion) {
    // Continuous micro-pulse for idle/listening, breathing for others.
    const isAmbient = state === 'idle' || state === 'listening' || state === 'processing';
    pulse.value = withRepeat(
      withTiming(isAmbient ? 1.12 : 1.04, { duration: isAmbient ? 900 : 1400, easing: theme.curve.pop }),
      -1,
      true,
    );
  }

  const animatedStyle = useAnimatedStyle(() => {
    const p = pulse.value;
    const r = ORB_RADIUS * p;
    const opacity = state === 'offline' || state === 'error' ? 0.6 : 1;
    return {
      transform: [{ scale: p }],
      opacity,
      shadowRadius: 18 * p,
      elevation: 8 * p,
    };
  });

  const statusLabel = config.label;

  return (
    <Card style={[styles.root, style]}>
      <View style={styles.row}>
        <View style={styles.orbWrap}>
          <Svg width={84} height={84} viewBox={`0 0 ${X_AXIS * 2} ${Y_AXIS * 2}`}>
            <defs>
              <RadialGradient id="coreGrad" cx={0.5} cy={0.5} r={0.5}>
                <Stop offset="0%" stopColor={colors.primaryLight} stopOpacity={0.9} />
                <Stop offset="100%" stopColor={config.core} stopOpacity={0.95} />
              </RadialGradient>
            </defs>
            {/* Ring */}
            <Circle
              cx={X_AXIS}
              cy={Y_AXIS}
              r={OUTER_RADIUS}
              stroke={config.ring}
              strokeOpacity={0.55}
              strokeWidth={2.5}
            />
            {/* Core orb */}
            <Circle cx={X_AXIS} cy={Y_AXIS} r={ORB_RADIUS} fill="url(#coreGrad)" />
            {/* Inner highlight */}
            <Circle cx={X_AXIS} cy={Y_AXIS} r={ORB_RADIUS * 0.62} fill="rgba(255,255,255,0.18)" />
          </Svg>
          <View style={styles.orbLabel}>
            <TextCenter size="display" fontWeight="black" color="text">
              {config.label}
            </TextCenter>
            <CoreIndicators state={state} />
          </View>
        </View>

        <VStack gap={6} style={styles.racetrack}>
          <HStack gap={4}>
            {metrics?.agentName && (
              <View style={styles.meta}>
                <TextCenter size="bodySm" fontWeight="semibold" color="primary">
                  {metrics.agentName}
                </TextCenter>
              </View>
            )}
            {metrics?.model && (
              <View style={styles.meta}>
                <TextCenter size="caption" color="muted">
                  {metrics.model}
                </TextCenter>
              </View>
            )}
          </HStack>
          {metrics?.connectivity && (
            <View style={styles.meta}>
              <TextCenter size="caption" color="muted">
                {metrics.connectivity}
              </TextCenter>
            </View>
          )}
          {metrics?.task && (
            <View style={styles.meta}>
              <TextCenter size="captionSm" color="muted">
                {metrics.task}
              </TextCenter>
            </View>
          )}
          {metrics?.duration && (
            <View style={styles.meta}>
              <TextCenter size="captionSm" color="cyan" fontWeight="medium">
                {metrics.duration}
              </TextCenter>
            </View>
          )}
        </VStack>
      </View>

      {/* Press hint */}
      <View style={styles.hintRow}>
        <TextCenter size="caption" color="dim">
          Toque para detalhes
        </TextCenter>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  root: {
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  orbWrap: {
    position: 'relative',
    alignItems: 'center',
  },
  markersWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeTick: {
    position: 'absolute',
    borderRadius: 8,
    transform: [{ scale: 0 }],
  },
  orbLabel: {
    position: 'absolute',
    bottom: -18,
    alignItems: 'center',
    gap: 4,
  },
  racetrack: {
    gap: 4,
  },
  meta: {
    minWidth: 72,
  },
  hintRow: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 8,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});

export default CentralCore;
