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
  return (
    <View style={[styles.bar, { paddingBottom: space.sm + bottomInset }]}>
      <View style={styles.chips}>
        <Button label="Interrupt" variant="tonal" compact disabled={!canRespond} onPress={() => onInterrupt('esc')} style={styles.chip} />
        <Button label="Stop" variant="tonal" compact disabled={!canRespond} onPress={() => onInterrupt('ctrl-c')} style={styles.chip} />
        <View style={{ flex: 1 }} />
        <IconButton icon={Keyboard} label="Raw keyboard" onPress={onKeyboard} color={colors.muted} />
      </View>
      <MessageField
        value={text}
        onChangeText={setText}
        onSend={send}
        placeholder={canRespond ? 'Prompt the agent' : 'Turn on Respond in Settings › Remote'}
        editable={canRespond}
        label="Prompt"
        sendLabel="Send prompt"
      />
    </View>
  );
}

export function MessageField({
  value,
  onChangeText,
  onSend,
  placeholder,
  editable = true,
  sending,
  autoFocus,
  label = 'Message',
  sendLabel = 'Send',
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  placeholder: string;
  editable?: boolean;
  sending?: boolean;
  autoFocus?: boolean;
  label?: string;
  sendLabel?: string;
}) {
  const ready = !!value.trim() && editable && !sending;
  return (
    <View style={styles.field}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.dim}
        value={value}
        onChangeText={onChangeText}
        multiline
        editable={editable && !sending}
        autoFocus={autoFocus}
        cursorColor={colors.brand}
        selectionColor={colors.brandSoft}
        accessibilityLabel={label}
      />
      <IconButton
        icon={ArrowUp}
        label={sendLabel}
        onPress={() => ready && onSend()}
        variant={ready ? 'filled' : 'tonal'}
        color={ready ? colors.onBrand : colors.dim}
        disabled={sending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: space.gutter,
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
