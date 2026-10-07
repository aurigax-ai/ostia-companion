import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ask } from '../model/asks';
import { colors, radius, space } from '../theme';
import { AskCard } from './AskCard';

export function AskSheet({
  ask,
  workspace,
  canRespond,
  pending,
  error,
  onAnswer,
  onClose,
}: {
  ask: Ask | null;
  workspace: string;
  canRespond: boolean;
  pending?: string;
  error?: string;
  onAnswer: (answer: { choiceId?: string; text?: string }) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={ask !== null} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      {ask ? (
        <View style={[styles.sheet, { paddingBottom: space.xl + insets.bottom }]}>
          <View style={styles.handle} />
          <AskCard
            ask={ask}
            workspace={workspace}
            canRespond={canRespond}
            pending={pending}
            error={error}
            onAnswer={onAnswer}
            flat
          />
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: space.gutter,
    paddingTop: space.sm,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, marginBottom: space.md },
});
