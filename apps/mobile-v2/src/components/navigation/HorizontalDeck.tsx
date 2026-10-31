/**
 * ODIN V2 — Horizontal Deck.
 *
 * Horizontal scroll pager for contextual navigation within a module (e.g.
 * Projects: Overview -> Activity -> Deploys -> Logs -> Settings). Snap points,
 * position indicator, and smooth snap transitions.
 */

import React from 'react';
import { View, StyleSheet, Text, ScrollView, type StyleProp, type ViewStyle, type ScrollViewInstance } from 'react-native';
import { useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { theme } from '../../theme/global-theme';
import { colors } from '../../theme/colors';
import { HStack, TextCenter, Card, SafePadded } from '../primitives';

export interface DeckSection {
  id: string;
  label: string;
  icon: string;
}

interface HorizontalDeckProps {
  sections: DeckSection[];
  activeSectionId: string;
  onChange: (sectionId: string) => void;
  /** Reduced motion (accessibility) */
  reducedMotion?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const HorizontalDeck: React.FC<HorizontalDeckProps> = ({
  sections,
  activeSectionId,
  onChange,
  reducedMotion = false,
  style,
}) => {
  const scrollRef = React.useRef<ScrollViewInstance | null>(null);
  const scrollOffset = useSharedValue(0);

  const activeIndex = sections.findIndex((s) => s.id === activeSectionId);
  const count = sections.length;

  // Snap springs.
  const snap = (index: number) => {
    const target = (index / Math.max(count - 1, 1)) * 100;
    if (reducedMotion) {
      scrollOffset.value = withTiming(target, { duration: 120 });
    } else {
      scrollOffset.value = withSpring(target, { damping: 28, stiffness: 220 });
    }
    scrollRef.current?.scrollTo({
      x: index * 100,
      y: 0,
      animated: !reducedMotion,
    });
  };

  const onScroll = (event: any) => {
    const offset = event.nativeEvent.contentOffset.x;
    scrollOffset.value = offset;
  };

  // Gesture: horizontal pan to scrub the deck.
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      scrollOffset.value = e.translationX + scrollOffset.value;
    })
    .onEnd((e) => {
      const index = Math.round(e.translationX / 100 + activeIndex);
      const clamped = Math.max(0, Math.min(count - 1, index));
      if (clamped !== activeIndex) onChange(sections[clamped]?.id ?? '');
    });

  return (
    <SafePadded style={[styles.root, style]}>
      {/* Section labels (visible while scrolling, providing context) */}
      <HStack gap={16} style={styles.labels}>
        {sections.map((section) => {
          const idx = sections.findIndex((s) => s.id === section.id);
          const active = idx === activeIndex;
          return (
            <View key={section.id} style={[styles.label, { opacity: active ? 1 : 0.5 }]}>
              <TextCenter size="captionSm" fontWeight={600} color={active ? 'primary' : 'muted'}>
                {section.icon}
                {section.label}
              </TextCenter>
            </View>
          );
        })}
      </HStack>

      {/* Scrollable deck */}
      <GestureDetector gesture={pan}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.content}
          onScroll={onScroll}
          scrollEventThrottle={16}
          nestedScrollEnabled={true}
        >
          {sections.map((section) => {
            const idx = sections.findIndex((s) => s.id === section.id);
            const active = idx === activeIndex;
            return (
              <View
                key={section.id}
                style={[
                  styles.slide,
                  {
                    opacity: active ? 1 : 0.55,
                    width: 100,
                  },
                  active && styles.slideActive,
                ]}
              >
                <View style={[styles.slideIcon, active && styles.slideIconActive]}>
                  <TextCenter size="bodySm" fontWeight={600} color={active ? 'primary' : 'muted'}>
                    {section.icon}
                  </TextCenter>
                </View>
                <TextCenter size="bodySm" fontWeight={600} color={active ? 'text' : 'textSoft'}>
                  {section.label}
                </TextCenter>
              </View>
            );
          })}
        </ScrollView>
      </GestureDetector>

      {/* Position indicator (dots) */}
      <HStack gap={5} style={styles.dots}>
        {sections.map((section, idx) => {
          const active = idx === activeIndex;
          return (
            <View
              key={section.id}
              style={[
                styles.dot,
                {
                  backgroundColor: active ? colors.primary : colors.border,
                  width: active ? 10 : 6,
                  height: active ? 10 : 6,
                  borderRadius: active ? 5 : 3,
                },
              ]}
            />
          );
        })}
      </HStack>
    </SafePadded>
  );
};

const styles = StyleSheet.create({
  root: {
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  labels: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  label: {
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 20,
  },
  slide: {
    alignItems: 'center',
    width: 100,
    paddingHorizontal: 12,
  },
  slideActive: {
    opacity: 1,
  },
  slideIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideIconActive: {
    backgroundColor: colors.primary,
  },
  dots: {
    paddingTop: 12,
  },
  dot: {
    borderRadius: 3,
  },
});

export default HorizontalDeck;
