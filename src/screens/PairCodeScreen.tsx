import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CheckCodeView } from '../components/CheckCodeView';
import { HeaderTitle } from '../components/ui';
import { ScreenProps } from '../navigation';
import { CODE_LENGTH, codeInput, codeToSubmit } from '../services/pairCode';
import { pairWithTarget } from '../services/pairWith';
import { usePairing } from '../services/usePairing';
import { colors, font, radius, space, type } from '../theme';

const HALF = CODE_LENGTH / 2;

export function PairCodeScreen({ navigation, route, onPaired }: ScreenProps<'PairCode'> & { onPaired: () => Promise<void> }) {
  const desktop = route.params;
  const [chars, setChars] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const input = useRef<TextInput>(null);
  const pairing = usePairing(onPaired);
  const { code } = codeInput(chars);

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: () => <HeaderTitle title={desktop.name} subtitle={desktop.host} mono /> });
  }, [navigation, desktop.name, desktop.host]);

  useEffect(() => {
    const next = codeToSubmit(code, failed);
    if (!next || pairing.busy) return;
    void pairing.run(
      (onCheck) => pairWithTarget({ ...desktop, pairCode: next }, onCheck),
      () => setFailed(next),
    );
  }, [code, failed]);

  if (pairing.check) {
    return (
      <CheckCodeView
        code={pairing.check.code}
        startedAt={pairing.check.startedAt}
        desktop={desktop.name}
        onCancel={pairing.cancel}
      />
    );
  }

  const boxes = Array.from({ length: CODE_LENGTH }, (_, index) => chars[index] ?? '');

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <Text style={type.title}>Enter the pairing code</Text>
      <Text style={[type.bodyMuted, { marginTop: space.sm }]}>
        Shown under the QR code on your desktop.
      </Text>
      <Pressable style={styles.boxes} onPress={() => input.current?.focus()} accessible={false}>
        {boxes.map((char, index) => (
          <React.Fragment key={index}>
            {index === HALF ? <Text style={styles.dash}>–</Text> : null}
            <View style={[styles.box, index === chars.length && styles.boxCurrent]}>
              <Text style={styles.char}>{char}</Text>
            </View>
          </React.Fragment>
        ))}
        <TextInput
          ref={input}
          style={styles.hiddenInput}
          value={chars}
          onChangeText={(text) => setChars(codeInput(text).chars)}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          autoFocus
          caretHidden
          editable={!pairing.busy}
          contextMenuHidden={false}
          accessibilityLabel="Pairing code, 8 characters"
        />
      </Pressable>
      {failed && code === failed ? (
        <Text style={[type.bodyMuted, styles.hint]}>Edit the code to try again.</Text>
      ) : pairing.busy ? (
        <Text style={[type.bodyMuted, styles.hint]}>Pairing…</Text>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.xl },
  boxes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: space.xxl },
  box: {
    width: 34,
    height: 52,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxCurrent: { borderColor: colors.brand, backgroundColor: colors.surfaceHigh },
  char: { fontFamily: font.monoSemibold, fontSize: 22, lineHeight: 28, color: colors.fg },
  dash: { fontFamily: font.mono, fontSize: 22, color: colors.dim },
  hiddenInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, color: 'transparent', opacity: 0.02 },
  hint: { textAlign: 'center', marginTop: space.lg },
});
