import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, touch, type } from '../theme';

const HEIGHT = 28;

export function ChatSwitch({ value, onChange }: { value: 'chat' | 'terminal'; onChange: (value: 'chat' | 'terminal') => void }) {
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel="View">
      {(['chat', 'terminal'] as const).map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={option === 'chat' ? 'Chat' : 'Terminal'}
            accessibilityState={{ checked: selected }}
            hitSlop={{ top: (touch - HEIGHT) / 2, bottom: (touch - HEIGHT) / 2 }}
            onPress={() => !selected && onChange(option)}
            style={[styles.option, selected && styles.on]}
          >
            <Text style={[type.captionStrong, { color: selected ? colors.fg : colors.muted }]}>{option === 'chat' ? 'Chat' : 'Terminal'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 2, borderRadius: radius.full, backgroundColor: colors.surface },
  option: { height: HEIGHT, paddingHorizontal: space.md, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: colors.surfaceHigh },
});
