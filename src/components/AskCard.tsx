import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ask, detailPreview, waitedFor } from '../model/asks';
import { colors, mono, type } from '../theme';
import { Button } from './ui';

const VARIANT = { approve: 'filled', deny: 'tonal', neutral: 'text' } as const;

export function AskCard({
  ask,
  workspace,
  canRespond,
  pending,
  error,
  onAnswer,
}: {
  ask: Ask;
  workspace: string;
  canRespond: boolean;
  pending?: string;
  error?: string;
  onAnswer: (answer: { choiceId?: string; text?: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const preview = ask.detail ? detailPreview(ask.detail) : null;
  const disabled = !canRespond || pending !== undefined;

  return (
    <View style={styles.card}>
      <View style={styles.metaRow}>
        <Text style={styles.meta} numberOfLines={1}>
          {[workspace, ask.agent].filter(Boolean).join(' · ')}
        </Text>
        <Text style={type.caption}>{waitedFor(ask.since, now)}</Text>
      </View>
      <Text style={[type.body, styles.title]}>{ask.title}</Text>
      {preview ? (
        <View style={styles.detail}>
          <Text style={styles.detailText}>{expanded ? ask.detail : preview.text}</Text>
          {preview.more && !expanded ? (
            <Pressable accessibilityRole="button" onPress={() => setExpanded(true)} hitSlop={8}>
              <Text style={styles.more}>Show all</Text>
            </Pressable>
          ) : null}
        </View>
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
        {ask.choices.map((choice) =>
          pending === choice.id ? (
            <ActivityIndicator key={choice.id} color={colors.brand} style={styles.spinner} />
          ) : (
            <Button
              key={choice.id}
              label={choice.label}
              compact
              variant={VARIANT[choice.tone]}
              disabled={disabled}
              onPress={() => onAnswer({ choiceId: choice.id })}
            />
          ),
        )}
      </View>
      {!canRespond ? (
        <Text style={[type.caption, styles.note]}>Turn on Respond for this phone in Settings › Remote.</Text>
      ) : null}
      {error ? <Text style={[type.caption, styles.error]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  meta: { fontFamily: mono, fontSize: 12, lineHeight: 16, color: colors.muted, flex: 1 },
  title: { marginTop: 8 },
  detail: { marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: colors.bgSunken },
  detailText: { fontFamily: mono, fontSize: 12, lineHeight: 18, color: colors.muted },
  more: { ...type.label, color: colors.brand, marginTop: 8 },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  reply: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.bgSunken,
    color: colors.fg,
    fontSize: 14,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  spinner: { minHeight: 40, paddingHorizontal: 16 },
  note: { marginTop: 8 },
  error: { marginTop: 8, color: colors.attn },
});
