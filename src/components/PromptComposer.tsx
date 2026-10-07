import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Keyboard, Send } from 'lucide-react-native';
import { colors } from '../theme';
import { Button, HeaderIcon } from './ui';

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
  return (
    <View style={[styles.bar, { paddingBottom: 8 + bottomInset }]}>
      <View style={styles.chips}>
        <Button label="Interrupt" variant="tonal" compact disabled={!canRespond} onPress={() => onInterrupt('esc')} />
        <Button label="Stop" variant="tonal" compact disabled={!canRespond} onPress={() => onInterrupt('ctrl-c')} />
        <View style={{ flex: 1 }} />
        <HeaderIcon icon={Keyboard} label="Raw keyboard" onPress={onKeyboard} color={colors.muted} />
      </View>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder={canRespond ? 'Prompt the agent' : 'Turn on Respond in Settings › Remote'}
          placeholderTextColor={colors.dim}
          value={text}
          onChangeText={setText}
          multiline
          editable={canRespond}
          cursorColor={colors.brand}
          accessibilityLabel="Prompt"
        />
        <HeaderIcon
          icon={Send}
          label="Send prompt"
          onPress={send}
          color={text.trim() && canRespond ? colors.brand : colors.dim}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 8,
    paddingTop: 8,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
    gap: 8,
  },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.bgSunken,
    color: colors.fg,
    fontSize: 16,
  },
});
