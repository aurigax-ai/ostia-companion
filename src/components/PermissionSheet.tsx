import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ask, AskChoice, needsConfirm } from '../model/asks';
import { colors, font, radius, space, type } from '../theme';
import { Button, NO_SCROLL_BARS, Sheet } from './ui';

const VARIANT = { approve: 'filled', neutral: 'tonal', deny: 'danger' } as const;

export function PermissionSheet({
  ask,
  where,
  canRespond,
  pending,
  error,
  onAnswer,
  onClose,
}: {
  ask: Ask | null;
  where: string;
  canRespond: boolean;
  pending?: string;
  error?: string;
  onAnswer: (answer: { choiceId?: string; text?: string }) => void;
  onClose: () => void;
}) {
  const [reply, setReply] = useState('');
  const disabled = !canRespond || pending !== undefined;

  const choose = (current: Ask, choice: AskChoice) => {
    if (!needsConfirm(current, choice)) return onAnswer({ choiceId: choice.id });
    Alert.alert(`${choice.label}?`, current.detail ?? current.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Allow', style: 'destructive', onPress: () => onAnswer({ choiceId: choice.id }) },
    ]);
  };

  return (
    <Sheet visible={ask !== null} onClose={onClose}>
      {ask ? (
        <View style={styles.body}>
          <Text style={type.headline}>{ask.title}</Text>
          {where ? <Text style={type.caption}>{where}</Text> : null}
          {ask.detail ? (
            <ScrollView {...NO_SCROLL_BARS} style={styles.detail} nestedScrollEnabled>
              <Text style={styles.detailText} selectable>
                {ask.detail}
              </Text>
            </ScrollView>
          ) : null}
          {ask.allowText ? (
            <View style={styles.replyRow}>
              <TextInput
                style={styles.reply}
                placeholder="Reply"
                placeholderTextColor={colors.dim}
                value={reply}
                onChangeText={setReply}
                editable={!disabled}
                cursorColor={colors.brand}
                selectionColor={colors.brandSoft}
                accessibilityLabel={`Reply to ${ask.title}`}
              />
              <Button label="Send" compact disabled={disabled || !reply.trim()} onPress={() => (onAnswer({ text: reply.trim() }), setReply(''))} />
            </View>
          ) : null}
          <View style={styles.choices}>
            {[...ask.choices].sort((a, b) => ORDER[a.tone] - ORDER[b.tone]).map((choice) => (
              <Button key={choice.id} label={choice.label} compact variant={VARIANT[choice.tone]} loading={pending === choice.id} disabled={disabled} onPress={() => choose(ask, choice)} />
            ))}
          </View>
          {!canRespond ? <Text style={type.caption}>Turn on Respond for this phone in Settings › Remote.</Text> : null}
          {error ? <Text style={[type.caption, styles.error]}>{error}</Text> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const ORDER = { approve: 0, neutral: 1, deny: 2 };

const styles = StyleSheet.create({
  body: { gap: space.sm },
  detail: { maxHeight: 132, borderRadius: radius.md, backgroundColor: colors.bgSunken, paddingHorizontal: space.md, paddingVertical: space.sm },
  detailText: { fontFamily: font.mono, fontSize: 12, lineHeight: 17, color: colors.fg },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  reply: { flex: 1, minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.full, backgroundColor: colors.bgSunken, color: colors.fg, fontFamily: font.regular, fontSize: 14 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  error: { color: colors.attn },
});
