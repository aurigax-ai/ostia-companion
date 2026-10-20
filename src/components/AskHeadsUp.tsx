import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ask } from '../model/asks';
import { colors, radius, space, touch, type } from '../theme';

export function AskHeadsUp({ ask, onOpen }: { ask: Ask; onOpen: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ask.title}, answer`}
      onPress={onOpen}
      android_ripple={{ color: colors.ripple }}
      style={styles.bar}
    >
      <View style={styles.dot} />
      <Text style={[type.bodyMuted, styles.question]} numberOfLines={1}>
        {ask.title}
      </Text>
      <Text style={[type.label, styles.answer]}>Answer</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    marginHorizontal: space.gutter,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    minHeight: touch,
    borderRadius: radius.md + 2,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.attn },
  question: { flex: 1, color: colors.fg },
  answer: { color: colors.brand },
});
