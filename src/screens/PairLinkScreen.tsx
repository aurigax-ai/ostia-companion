import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { CheckCodeView } from '../components/CheckCodeView';
import { Button } from '../components/ui';
import { ScreenProps } from '../navigation';
import { pairWith } from '../services/pairWith';
import { usePairing } from '../services/usePairing';
import { colors, type } from '../theme';

export function PairLinkScreen({ onPaired }: ScreenProps<'PairLink'> & { onPaired: () => Promise<void> }) {
  const [link, setLink] = useState('');
  const pairing = usePairing(onPaired);

  if (pairing.checkCode) return <CheckCodeView code={pairing.checkCode} desktop="your desktop" />;

  const submit = () => void pairing.run((onCheck) => pairWith(link, onCheck));

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={type.bodyMuted}>
        Copy the link under the QR code in Ostia Settings → Remote and paste it here.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="ostia-pair://…"
        placeholderTextColor={colors.dim}
        value={link}
        onChangeText={setLink}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        multiline
        cursorColor={colors.brand}
        selectionColor={colors.brandSoft}
      />
      <View style={{ marginTop: 'auto' }}>
        <Button label="Pair" onPress={submit} loading={pairing.busy} disabled={!link.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, paddingBottom: 24 },
  input: {
    marginTop: 16,
    minHeight: 120,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    color: colors.fg,
    fontFamily: 'monospace',
    fontSize: 13,
    textAlignVertical: 'top',
  },
});
