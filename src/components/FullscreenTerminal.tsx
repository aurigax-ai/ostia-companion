import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { TerminalCopy } from '../model/terminalCopy';
import { KeyRowEvent, KeyRowState } from '../model/terminalKeys';
import { Box } from '../model/terminalFit';
import { lockLandscape, lockPortrait } from '../services/orientation';
import { HoldStatus } from '../services/terminalHold';
import { colors, space, touch, type } from '../theme';
import { KeyBar, RawKeyboard } from './TerminalKeys';
import { TerminalGrid } from './TerminalGrid';

export function FullscreenTerminal({
  copy,
  version,
  title,
  keyState,
  holdStatus,
  onMeasure,
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
  holdStatus: HoldStatus;
  onMeasure: (box: Box) => void;
  canType: boolean;
  keyboardOpen: boolean;
  onKey: (event: KeyRowEvent) => void;
  onKeyboard: () => void;
  onText: (text: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    void lockLandscape();
    return () => void lockPortrait();
  }, []);
  return (
    <View style={styles.root} testID="fullscreen-terminal">
      <View style={[styles.inner, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to commands" hitSlop={space.md} onPress={onBack} style={styles.back}>
            <ChevronLeft size={20} color={colors.fg} strokeWidth={2.25} />
          </Pressable>
          <Text style={type.headline} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[type.caption, { flex: 1 }]} numberOfLines={1}>
            {holdStatus === 'held' ? 'desktop sized to this phone' : 'at the desktop size'}
          </Text>
        </View>
        <TerminalGrid copy={copy} version={version} fit="box" onMeasure={onMeasure} />
        {canType ? (
          <>
            {keyboardOpen ? <RawKeyboard onText={onText} onBackspace={onBackspace} onEnter={onEnter} /> : null}
            <KeyBar state={keyState} onEvent={onKey} onKeyboard={onKeyboard} bottomInset={insets.bottom} />
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg },
  inner: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, minHeight: touch - 12 },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
