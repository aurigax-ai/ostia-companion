import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacedCheckCode } from '../services/pairCheck';
import { approvalCountdown } from '../services/pairFlow';
import { colors, mono, type } from '../theme';
import { Button } from './ui';

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
        <Text style={[type.bodyMuted, styles.center]}>Check code</Text>
        <Text style={styles.code} accessibilityLabel={code.split('').join(' ')}>
          {spacedCheckCode(code)}
        </Text>
        <Text style={[type.title, styles.center, { marginTop: 32 }]}>Does {desktop} show the same number?</Text>
        <Text style={[type.bodyMuted, styles.center, { marginTop: 8 }]}>
          Approve on the desktop only if it matches.
        </Text>
        <View style={styles.waiting}>
          <ActivityIndicator color={colors.brand} />
          <Text style={[type.bodyMuted, { marginLeft: 12 }]}>
            Waiting · {approvalCountdown(startedAt, now)}
          </Text>
        </View>
      </View>
      <Button label="Cancel" variant="tonal" onPress={onCancel} style={styles.cancel} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  body: { flex: 1, justifyContent: 'center' },
  center: { textAlign: 'center' },
  code: {
    marginTop: 16,
    textAlign: 'center',
    color: colors.fg,
    fontFamily: mono,
    fontSize: 44,
    lineHeight: 52,
    fontWeight: '600',
    letterSpacing: 4,
  },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  cancel: { marginBottom: 16 },
});
