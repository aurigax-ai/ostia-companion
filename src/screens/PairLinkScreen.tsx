import React, { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCodeView } from '../components/CheckCodeView';
import { Button } from '../components/ui';
import { ScreenProps } from '../navigation';
import { parsePairingPayload } from '../services/pairing';
import { pairWith } from '../services/pairWith';
import { usePairing } from '../services/usePairing';
import { colors, font, radius, space, type } from '../theme';

export function PairLinkScreen({ onPaired }: ScreenProps<'PairLink'> & { onPaired: () => Promise<void> }) {
  const [link, setLink] = useState('');
  const pairing = usePairing(onPaired);
  const insets = useSafeAreaInsets();

  if (pairing.check) {
    return (
      <CheckCodeView
        code={pairing.check.code}
        startedAt={pairing.check.startedAt}
        desktop={desktopName(link)}
        onCancel={pairing.cancel}
      />
    );
  }

  const submit = () => void pairing.run((onCheck) => pairWith(link, onCheck));

  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding">
      <View style={[styles.screen, { paddingBottom: space.lg + insets.bottom }]}>
      <Text style={type.bodyMuted}>
        Paste the link shown under the QR code.
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { flex: 1, padding: space.lg },
  input: {
    marginTop: space.lg,
    minHeight: 120,
    padding: space.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    color: colors.fg,
    fontFamily: font.mono,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
});

function desktopName(link: string): string {
  try {
    return parsePairingPayload(link).name || 'your desktop';
  } catch {
    return 'your desktop';
  }
}
