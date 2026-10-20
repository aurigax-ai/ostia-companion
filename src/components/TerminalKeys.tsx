import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyRowEvent, KeyRowState, RowKey } from '../model/terminalKeys';
import { colors, font, radius, space, touch } from '../theme';

const KEYS: { key: RowKey; label: string }[] = [
  { key: 'up', label: '↑' },
  { key: 'down', label: '↓' },
  { key: 'left', label: '←' },
  { key: 'right', label: '→' },
  { key: 'enter', label: '⏎' },
];

export function KeyBar({
  state,
  onEvent,
  onKeyboard,
  bottomInset,
}: {
  state: KeyRowState;
  onEvent: (event: KeyRowEvent) => void;
  onKeyboard?: () => void;
  bottomInset: number;
}) {
  return (
    <View style={[styles.bar, { paddingBottom: space.sm + bottomInset }]}>
      <KeyButton label="esc" onPress={() => onEvent({ type: 'key', key: 'esc' })} />
      <KeyButton label="tab" onPress={() => onEvent({ type: 'key', key: 'tab' })} />
      <KeyButton label="ctrl" active={state.ctrl} onPress={() => onEvent({ type: 'ctrl' })} />
      {KEYS.map(({ key, label }) => (
        <KeyButton key={key} label={label} onPress={() => onEvent({ type: 'key', key })} />
      ))}
      {onKeyboard ? <KeyButton label="abc" accessibilityLabel="Keyboard" onPress={onKeyboard} /> : null}
    </View>
  );
}

function KeyButton({
  label,
  active,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      onPress={onPress}
      hitSlop={{ top: (touch - HEIGHT) / 2, bottom: (touch - HEIGHT) / 2 }}
      android_ripple={{ color: colors.ripple }}
      style={({ pressed }) => [styles.key, pressed && Platform.OS === 'ios' && styles.keyPressed, active && styles.keyActive]}
    >
      <Text style={[styles.label, active && { color: colors.brand }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function RawKeyboard({ onText, onBackspace, onEnter }: { onText: (text: string) => void; onBackspace: () => void; onEnter: () => void }) {
  const [value, setValue] = useState('');
  return (
    <TextInput
      autoFocus
      autoCapitalize="none"
      autoCorrect={false}
      value={value}
      accessibilityLabel="Type to the terminal"
      placeholder="Type to the terminal"
      placeholderTextColor={colors.dim}
      cursorColor={colors.brand}
      style={styles.raw}
      onChangeText={(text) => {
        if (text) onText(text);
        setValue('');
      }}
      onKeyPress={({ nativeEvent }) => nativeEvent.key === 'Backspace' && onBackspace()}
      onSubmitEditing={onEnter}
      submitBehavior="submit"
    />
  );
}

const HEIGHT = 32;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: space.gutter,
    paddingTop: space.sm,
    backgroundColor: colors.surface,
  },
  key: {
    flex: 1,
    height: HEIGHT,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  keyPressed: { backgroundColor: colors.surfacePressed },
  keyActive: { backgroundColor: colors.brandSoft },
  label: { fontFamily: font.monoSemibold, fontSize: 12, lineHeight: 16, color: colors.fg },
  raw: {
    height: 36,
    marginHorizontal: space.gutter,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: colors.bgSunken,
    color: colors.fg,
    fontFamily: font.mono,
    fontSize: 13,
  },
});
