import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, touch, type } from '../theme';

export type TerminalMode = 'commands' | 'terminal';

const OPTIONS: { value: TerminalMode; label: string }[] = [
  { value: 'commands', label: 'Commands' },
  { value: 'terminal', label: 'Terminal' },
];

const HEIGHT = 28;

export function ModeSwitch({ value, onChange }: { value: TerminalMode; onChange: (mode: TerminalMode) => void }) {
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel="View">
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            hitSlop={{ top: (touch - HEIGHT) / 2, bottom: (touch - HEIGHT) / 2 }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentOn]}
          >
            <Text style={[type.captionStrong, selected && { color: colors.fg }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 2, borderRadius: radius.full, backgroundColor: colors.surface },
  segment: { height: HEIGHT - 4, paddingHorizontal: 10, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.surfaceHigh },
});
