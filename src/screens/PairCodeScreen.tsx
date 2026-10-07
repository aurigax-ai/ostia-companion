import React, { useLayoutEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { CheckCodeView } from '../components/CheckCodeView';
import { Button } from '../components/ui';
import { ScreenProps } from '../navigation';
import { codeProblem, normalizeCode } from '../services/pairCode';
import { pairWithTarget } from '../services/pairWith';
import { usePairing } from '../services/usePairing';
import { colors, type } from '../theme';

export function PairCodeScreen({ navigation, route, onPaired }: ScreenProps<'PairCode'> & { onPaired: () => Promise<void> }) {
  const desktop = route.params;
  const [input, setInput] = useState('');
  const pairing = usePairing(onPaired);
  const code = normalizeCode(input);
  const problem = codeProblem(input);

  useLayoutEffect(() => {
    navigation.setOptions({ title: desktop.name });
  }, [navigation, desktop.name]);

  if (pairing.checkCode) return <CheckCodeView code={pairing.checkCode} desktop={desktop.name} />;

  const submit = () => {
    if (!code) return;
    void pairing.run((onCheck) => pairWithTarget({ ...desktop, pairCode: code }, onCheck));
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={type.bodyMuted}>Type the pairing code Ostia shows in Settings → Remote.</Text>
      <TextInput
        style={styles.input}
        placeholder="ABCD-EFGH"
        placeholderTextColor={colors.dim}
        value={input}
        onChangeText={setInput}
        onSubmitEditing={submit}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        autoFocus
        maxLength={9}
        returnKeyType="go"
        cursorColor={colors.brand}
        selectionColor={colors.brandSoft}
        accessibilityLabel="Pairing code"
      />
      {problem ? <Text style={[type.caption, { color: colors.attnFg, marginTop: 8 }]}>{problem}</Text> : null}
      <View style={{ marginTop: 'auto' }}>
        <Button label="Pair" onPress={submit} loading={pairing.busy} disabled={!code} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, paddingBottom: 24 },
  input: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    color: colors.fg,
    fontFamily: 'monospace',
    fontSize: 28,
    letterSpacing: 4,
    textAlign: 'center',
  },
});
