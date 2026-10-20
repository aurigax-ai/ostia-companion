import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { TerminalCopy } from '../model/terminalCopy';
import { KeyRowEvent, KeyRowState } from '../model/terminalKeys';
import { colors, space, touch, type } from '../theme';
import { KeyBar, RawKeyboard } from './TerminalKeys';
import { TerminalGrid } from './TerminalGrid';

export function FullscreenTerminal({
  copy,
  version,
  title,
  keyState,
  canType,
  keyboardOpen,
  onKey,
  onKeyboard,
  onText,
  onBackspace,
  onEnter,
  onBack,
}: {
  copy: TerminalCopy;
  version: number;
  title: string;
  keyState: KeyRowState;
  canType: boolean;
  keyboardOpen: boolean;
  onKey: (event: KeyRowEvent) => void;
  onKeyboard: () => void;
  onText: (text: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  onBack: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const inner = { width: height, height: width };
  return (
    <View style={styles.root} testID="fullscreen-terminal">
      <View
        style={[
          styles.rotated,
          { width: inner.width, height: inner.height, left: (width - inner.width) / 2, top: (height - inner.height) / 2 },
        ]}
      >
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to commands" hitSlop={space.md} onPress={onBack} style={styles.back}>
            <ChevronLeft size={20} color={colors.fg} strokeWidth={2.25} />
          </Pressable>
          <Text style={type.headline} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[type.caption, { flex: 1 }]} numberOfLines={1}>
            {`desktop sized to this phone`}
          </Text>
        </View>
        <TerminalGrid copy={copy} version={version} sideways />
        {canType ? (
          <>
            {keyboardOpen ? <RawKeyboard onText={onText} onBackspace={onBackspace} onEnter={onEnter} /> : null}
            <KeyBar state={keyState} onEvent={onKey} onKeyboard={onKeyboard} bottomInset={Math.max(insets.left, space.xs)} />
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg },
  rotated: { position: 'absolute', transform: [{ rotate: '90deg' }], backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, minHeight: touch - 12 },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
