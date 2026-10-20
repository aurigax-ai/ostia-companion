import React, { useRef, useState } from 'react';
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

const HEIGHT = 32;

export function KeyBar({
  state,
  onEvent,
  onKeyboard,
  bottomInset,
  compact,
}: {
  state: KeyRowState;
  onEvent: (event: KeyRowEvent) => void;
  onKeyboard?: () => void;
  bottomInset: number;
  compact?: boolean;
}) {
  return (
    <View style={[styles.bar, compact ? [styles.barCompact, { paddingBottom: space.xs + Math.min(bottomInset, space.md) }] : { paddingBottom: space.sm + bottomInset }]}>
      <KeyButton compact={compact} label="esc" onPress={() => onEvent({ type: 'key', key: 'esc' })} />
      <KeyButton compact={compact} label="tab" onPress={() => onEvent({ type: 'key', key: 'tab' })} />
      <KeyButton compact={compact} label="ctrl" active={state.ctrl} onPress={() => onEvent({ type: 'ctrl' })} />
      {KEYS.map(({ key, label }) => (
        <KeyButton key={key} compact={compact} label={label} onPress={() => onEvent({ type: 'key', key })} />
      ))}
      {onKeyboard ? <KeyButton compact={compact} label="abc" accessibilityLabel="Keyboard" onPress={onKeyboard} /> : null}
    </View>
  );
}

function KeyButton({
  label,
  active,
  onPress,
  accessibilityLabel,
  compact,
}: {
  label: string;
  active?: boolean;
  compact?: boolean;
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
      style={({ pressed }) => [styles.key, compact && styles.keyCompact, pressed && Platform.OS === 'ios' && styles.keyPressed, active && styles.keyActive]}
    >
      <Text style={[styles.label, active && { color: colors.brand }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function RawKeyboard({
  onText,
  onBackspace,
  onEnter,
}: {
  onText: (text: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
}) {
  const [value, setValue] = useState('');
  const latest = useRef('');
  const commit = () => {
    const text = latest.current;
    latest.current = '';
    setValue('');
    if (text) onText(text);
  };
  return (
    <TextInput
      autoFocus
      multiline
      autoCapitalize="none"
      autoCorrect={false}
      value={value}
      accessibilityLabel="Type to the terminal"
      placeholder="Type, then ⏎ to send"
      placeholderTextColor={colors.dim}
      cursorColor={colors.brand}
      style={styles.raw}
      onChangeText={(text) => {
        latest.current = text;
        setValue(text);
      }}
      onKeyPress={({ nativeEvent }) => nativeEvent.key === 'Backspace' && latest.current === '' && onBackspace()}
      onEndEditing={commit}
      onSubmitEditing={() => {
        commit();
        onEnter();
      }}
      submitBehavior="submit"
    />
  );
}

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
  barCompact: { justifyContent: 'center', paddingTop: space.xs },
  keyCompact: { flex: 0, flexGrow: 1, maxWidth: 72 },
  keyPressed: { backgroundColor: colors.surfacePressed },
  keyActive: { backgroundColor: colors.brandSoft },
  label: { fontFamily: font.monoSemibold, fontSize: 12, lineHeight: 16, color: colors.fg },
  raw: {
    minHeight: 36,
    maxHeight: 96,
    marginHorizontal: space.gutter,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.bgSunken,
    color: colors.fg,
    fontFamily: font.mono,
    fontSize: 13,
  },
});
