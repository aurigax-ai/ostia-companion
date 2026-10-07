import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacedCheckCode } from '../services/pairCheck';
import { approvalCountdown } from '../services/pairFlow';
import { ShieldCheck } from 'lucide-react-native';
import { colors, font, space, type } from '../theme';
import { Button, IconTile } from './ui';

export function CheckCodeView({
  code,
  startedAt,
  desktop,
  onCancel,
}: {
  code: string;
  startedAt: number;
  desktop: string;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.body} accessibilityLiveRegion="polite">
        <View style={styles.mark}>
          <IconTile icon={ShieldCheck} tone="brand" size="lg" />
        </View>
        <Text style={[type.label, styles.center, { color: colors.muted }]}>Check code</Text>
        <Text style={styles.code} accessibilityLabel={code.split('').join(' ')}>
          {spacedCheckCode(code)}
        </Text>
        <Text style={[type.title, styles.center, { marginTop: space.xxl }]}>Does {desktop} show the same number?</Text>
        <Text style={[type.bodyMuted, styles.center, { marginTop: space.sm }]}>
          Approve on the desktop only if it matches.
        </Text>
        <View style={styles.waiting}>
          <ActivityIndicator color={colors.brand} />
          <Text style={[type.bodyMuted, styles.countdown]}>
            Waiting · {approvalCountdown(startedAt, now)}
          </Text>
        </View>
      </View>
      <Button label="Cancel" variant="tonal" onPress={onCancel} style={styles.cancel} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.gutter },
  body: { flex: 1, justifyContent: 'center' },
  mark: { alignItems: 'center', marginBottom: space.xl },
  center: { textAlign: 'center' },
  code: {
    marginTop: space.md,
    textAlign: 'center',
    color: colors.fg,
    fontFamily: font.monoSemibold,
    fontSize: 44,
    lineHeight: 52,
    letterSpacing: 4,
  },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: space.sm,
    marginTop: space.xxl,
    paddingHorizontal: space.lg,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  countdown: { fontVariant: ['tabular-nums'] },
  cancel: { marginBottom: space.lg },
});
