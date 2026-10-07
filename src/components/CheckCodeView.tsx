import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { spacedCheckCode } from '../services/pairCheck';
import { colors, type } from '../theme';

export function CheckCodeView({ code, desktop }: { code: string; desktop: string }) {
  return (
    <View style={styles.screen} accessibilityLiveRegion="polite">
      <Text style={[type.bodyMuted, styles.center]}>Check code</Text>
      <Text style={styles.code} accessibilityLabel={code.split('').join(' ')}>
        {spacedCheckCode(code)}
      </Text>
      <Text style={[type.title, styles.center, { marginTop: 24 }]}>Approve on {desktop}</Text>
      <Text style={[type.bodyMuted, styles.center, { marginTop: 8 }]}>
        Approve this phone in Ostia Settings → Remote only if the desktop shows the same code.
      </Text>
      <View style={styles.waiting}>
        <ActivityIndicator color={colors.brand} />
        <Text style={[type.bodyMuted, { marginLeft: 12 }]}>Waiting for the desktop…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', paddingHorizontal: 32 },
  center: { textAlign: 'center' },
  code: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.fg,
    fontFamily: 'monospace',
    fontSize: 48,
    lineHeight: 56,
    fontWeight: '600',
    letterSpacing: 2,
  },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 40 },
});
