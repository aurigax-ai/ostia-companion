import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { cleanPhoneName, PHONE_NAME_MAX } from '../model/phoneIdentity';
import { renamePhone } from '../services/phoneIdentity';
import { colors, font, radius, space, type } from '../theme';
import { Button, Sheet } from './ui';

export function PhoneNameSheet({ visible, name, onClose }: { visible: boolean; name: string; onClose: () => void }) {
  const [text, setText] = useState(name);
  const valid = cleanPhoneName(text) !== null;
  const save = async () => {
    if (await renamePhone(text)) onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          maxLength={PHONE_NAME_MAX}
          autoCorrect={false}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={() => valid && void save()}
          cursorColor={colors.brand}
          selectionColor={colors.brandSoft}
          accessibilityLabel="Phone name"
        />
        {text.trim() && !valid ? <Text style={[type.caption, styles.error]}>Use letters, numbers and punctuation only.</Text> : null}
        <Button label="Save" onPress={() => void save()} disabled={!valid} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md, paddingTop: space.md },
  input: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgSunken,
    color: colors.fg,
    fontFamily: font.regular,
    fontSize: 16,
  },
  error: { color: colors.attn },
});
