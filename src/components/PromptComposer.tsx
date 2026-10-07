import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { ArrowUp, Keyboard } from 'lucide-react-native';
import { colors, font, radius, space } from '../theme';
import { Button, IconButton } from './ui';

export function PromptComposer({
  canRespond,
  onPrompt,
  onInterrupt,
  onKeyboard,
  bottomInset,
}: {
  canRespond: boolean;
  onPrompt: (text: string) => void;
  onInterrupt: (key: 'esc' | 'ctrl-c') => void;
  onKeyboard: () => void;
  bottomInset: number;
}) {
  const [text, setText] = useState('');
  const send = () => {
    const prompt = text.trim();
    if (!prompt || !canRespond) return;
    onPrompt(prompt);
    setText('');
  };
  const ready = !!text.trim() && canRespond;
  return (
    <View style={[styles.bar, { paddingBottom: space.sm + bottomInset }]}>
      <View style={styles.chips}>
        <Button label="Interrupt" variant="tonal" compact disabled={!canRespond} onPress={() => onInterrupt('esc')} style={styles.chip} />
        <Button label="Stop" variant="tonal" compact disabled={!canRespond} onPress={() => onInterrupt('ctrl-c')} style={styles.chip} />
        <View style={{ flex: 1 }} />
        <IconButton icon={Keyboard} label="Raw keyboard" onPress={onKeyboard} color={colors.muted} />
      </View>
      <View style={styles.field}>
        <TextInput
          style={styles.input}
          placeholder={canRespond ? 'Prompt the agent' : 'Turn on Respond in Settings › Remote'}
          placeholderTextColor={colors.dim}
          value={text}
          onChangeText={setText}
          multiline
          editable={canRespond}
          cursorColor={colors.brand}
          selectionColor={colors.brandSoft}
          accessibilityLabel="Prompt"
        />
        <IconButton
          icon={ArrowUp}
          label="Send prompt"
          onPress={send}
          variant={ready ? 'filled' : 'tonal'}
          color={ready ? colors.onBrand : colors.dim}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    gap: space.sm,
  },
  chips: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chip: { minHeight: 32, paddingHorizontal: space.md },
  field: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingLeft: space.lg,
    padding: space.xs,
    borderRadius: radius.xxl,
    backgroundColor: colors.bgSunken,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 140,
    paddingVertical: 9,
    color: colors.fg,
    fontFamily: font.regular,
    fontSize: 16,
  },
});
