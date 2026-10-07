import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ask, AskChoice, detailPreview, waitedFor } from '../model/asks';
import { colors, font, radius, space, type } from '../theme';
import { Button, Card } from './ui';

export function AskCard({
  ask,
  workspace,
  canRespond,
  pending,
  error,
  onAnswer,
  compact,
  flat,
  onReply,
}: {
  ask: Ask;
  workspace: string;
  canRespond: boolean;
  pending?: string;
  error?: string;
  onAnswer: (answer: { choiceId?: string; text?: string }) => void;
  compact?: boolean;
  flat?: boolean;
  onReply?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const preview = ask.detail && !compact ? detailPreview(ask.detail) : null;
  const disabled = !canRespond || pending !== undefined;

  const secondary = ask.choices.filter((choice) => choice.tone !== 'approve');
  const primary = ask.choices.filter((choice) => choice.tone === 'approve');
  const choiceButton = (choice: AskChoice, variant: 'filled' | 'tonal') => (
    <Button
      key={choice.id}
      label={choice.label}
      variant={variant}
      loading={pending === choice.id}
      disabled={disabled}
      onPress={() => onAnswer({ choiceId: choice.id })}
      style={styles.choice}
    />
  );

  const Frame = flat ? View : Card;

  return (
    <Frame>
      <View style={styles.metaRow}>
        <View style={styles.attnDot} />
        <Text style={[type.mono, styles.meta]} numberOfLines={1}>
          {[workspace, ask.agent].filter(Boolean).join(' · ')}
        </Text>
        <Text style={type.caption}>{waitedFor(ask.since, now)}</Text>
      </View>
      <Text style={[type.headline, styles.title]}>{ask.title}</Text>
      {preview ? (
        <View style={styles.detail}>
          <Text style={styles.detailText} selectable>{expanded ? ask.detail : preview.text}</Text>
          {preview.more && !expanded ? (
            <Pressable accessibilityRole="button" onPress={() => setExpanded(true)} hitSlop={8}>
              <Text style={styles.more}>Show all</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {ask.allowText && !compact ? (
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
          <Button
            label="Send"
            compact
            disabled={disabled || !reply.trim()}
            onPress={() => onAnswer({ text: reply.trim() })}
          />
        </View>
      ) : null}
      <View style={styles.actions}>
        {secondary.length > 0 || (compact && ask.allowText && onReply) ? (
          <View style={styles.choiceRow}>
            {secondary.map((choice) => choiceButton(choice, 'tonal'))}
            {compact && ask.allowText && onReply ? (
              <Button label="Reply" variant="text" disabled={disabled} onPress={onReply} style={styles.choice} />
            ) : null}
          </View>
        ) : null}
        {primary.map((choice) => choiceButton(choice, 'filled'))}
      </View>
      {!canRespond ? (
        <Text style={[type.caption, styles.note]}>Turn on Respond for this phone in Settings › Remote.</Text>
      ) : null}
      {error ? <Text style={[type.caption, styles.error]}>{error}</Text> : null}
    </Frame>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  attnDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.attn },
  meta: { flex: 1 },
  title: { marginTop: space.sm },
  detail: {
    marginTop: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.bgSunken,
  },
  detailText: { ...type.mono, lineHeight: 18 },
  more: { ...type.label, color: colors.brand, marginTop: space.sm },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  reply: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: space.lg,
    borderRadius: radius.full,
    backgroundColor: colors.bgSunken,
    color: colors.fg,
    fontFamily: font.regular,
    fontSize: 14,
  },
  actions: { gap: space.sm, marginTop: space.lg },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: { flexGrow: 1, flexBasis: '40%', minHeight: 44 },
  note: { marginTop: space.md },
  error: { marginTop: space.sm, color: colors.attn },
});
