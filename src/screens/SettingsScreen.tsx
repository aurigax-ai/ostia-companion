import React from 'react';
import { Alert, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Check, Minus, Plus } from 'lucide-react-native';
import { Button, Divider, HeaderIcon, ListRow, SectionHeader } from '../components/ui';
import { connectionRows, routeLabel } from '../model/connectionInfo';
import { MAX_FONT_SIZE, MIN_FONT_SIZE, TerminalPrefs } from '../model/prefs';
import { ScreenProps } from '../navigation';
import { connectionLogText } from '../services/connectionLog';
import { openTailscaleApp } from '../services/openTailscaleApp';
import { setPrefs, usePrefs } from '../services/prefsStore';
import { Cap, OstiaRpc } from '../services/rpc';
import { useCaps, useConnectionStatus } from '../services/workspaceStore';
import { colors, mono, type } from '../theme';

const CONTRACT_VERSION = '1.4';

const ACCESS: { cap: Cap; title: string }[] = [
  { cap: 'read', title: 'See workspaces and terminals' },
  { cap: 'notify', title: 'Notifications' },
  { cap: 'input', title: 'Type in terminals' },
  { cap: 'command', title: 'Run Ostia commands' },
];

const STATE = { connected: 'Connected', connecting: 'Connecting…', disconnected: 'Offline', revoked: 'Removed' };

const TOGGLES: { key: keyof TerminalPrefs; title: string }[] = [
  { key: 'fitWhenWatching', title: 'Fit desktop width when watching' },
  { key: 'keyRow', title: 'Key row' },
  { key: 'haptics', title: 'Haptics' },
];

function Value({ text, mono: isMono }: { text: string; mono?: boolean }) {
  return (
    <Text style={[isMono ? styles.mono : type.bodyMuted, styles.value]} numberOfLines={1}>
      {text}
    </Text>
  );
}

export function SettingsScreen({ navigation, onUnpair }: ScreenProps<'Settings'> & { onUnpair: () => Promise<void> }) {
  const pairing = OstiaRpc.getPairing();
  const caps = useCaps();
  const status = useConnectionStatus();
  const prefs = usePrefs();
  const name = pairing?.desktopName || 'Desktop';

  const confirmRemove = () =>
    Alert.alert(`Remove ${name}?`, 'Pair again to use it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void onUnpair() },
    ]);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <SectionHeader title="Desktop" />
      <ListRow title={name} trailing={<Value text={STATE[status]} />} />
      {pairing
        ? connectionRows(pairing).map((row) => (
            <React.Fragment key={row.title}>
              <Divider />
              <ListRow title={row.title} trailing={<Value text={row.value} mono={row.mono} />} />
            </React.Fragment>
          ))
        : null}
      {pairing && routeLabel(pairing.gatewayHost) === 'Tailscale' ? (
        <>
          <Divider />
          <ListRow title="Open Tailscale" onPress={() => void openTailscaleApp()} />
        </>
      ) : null}
      <Divider />
      <ListRow title="Desktops" onPress={() => navigation.navigate('Desktops')} />

      <SectionHeader title="Access" />
      {ACCESS.map(({ cap, title }, index) => (
        <React.Fragment key={cap}>
          {index > 0 ? <Divider /> : null}
          <ListRow
            title={title}
            trailing={caps.includes(cap) ? <Check size={20} color={colors.fg} /> : <Minus size={20} color={colors.dim} />}
          />
        </React.Fragment>
      ))}
      <Text style={[type.caption, styles.note]}>Change access in Settings › Remote on your desktop.</Text>

      <SectionHeader title="Terminal" />
      <ListRow
        title="Text size"
        trailing={
          <View style={styles.stepper}>
            <HeaderIcon icon={Minus} label="Smaller text" onPress={() => setPrefs({ fontSize: prefs.fontSize - 1 })} />
            <Text style={[styles.mono, styles.size]}>{prefs.fontSize}</Text>
            <HeaderIcon icon={Plus} label="Larger text" onPress={() => setPrefs({ fontSize: prefs.fontSize + 1 })} />
          </View>
        }
      />
      {TOGGLES.map(({ key, title }) => (
        <React.Fragment key={key}>
          <Divider />
          <ListRow
            title={title}
            trailing={
              <Switch
                accessibilityLabel={title}
                value={prefs[key] as boolean}
                onValueChange={(value) => setPrefs({ [key]: value })}
                trackColor={{ true: colors.brand, false: colors.surfaceHigh }}
                thumbColor={colors.fg}
              />
            }
          />
        </React.Fragment>
      ))}
      <Text style={[type.caption, styles.note]}>
        Text size {MIN_FONT_SIZE}–{MAX_FONT_SIZE}. Applies to terminals on this phone.
      </Text>

      <SectionHeader title="About" />
      <ListRow title="Version" trailing={<Value text={Constants.expoConfig?.version ?? '—'} mono />} />
      <Divider />
      <ListRow title="Contract" trailing={<Value text={CONTRACT_VERSION} mono />} />
      <Divider />
      <ListRow title="Share connection log" onPress={() => void Share.share({ message: connectionLogText() })} />

      <Button label="Remove this desktop" variant="danger" onPress={confirmRemove} style={styles.remove} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  mono: { fontFamily: mono, fontSize: 12, lineHeight: 16, color: colors.muted },
  value: { maxWidth: 200, textAlign: 'right' },
  note: { paddingHorizontal: 16, paddingTop: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  size: { width: 28, textAlign: 'center', color: colors.fg, fontSize: 14 },
  remove: { margin: 16, marginTop: 32 },
});
