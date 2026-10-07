import React, { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Check, Minus, Plus } from 'lucide-react-native';
import { Button, Group, IconButton, ListRow, SectionHeader } from '../components/ui';
import { connectionRows, routeLabel } from '../model/connectionInfo';
import { MAX_FONT_SIZE, MIN_FONT_SIZE, TerminalPrefs } from '../model/prefs';
import { ScreenProps } from '../navigation';
import { connectionLogText } from '../services/connectionLog';
import { openTailscaleApp } from '../services/openTailscaleApp';
import { setPrefs, usePrefs } from '../services/prefsStore';
import { setAlertPrefs, useAlertPrefs } from '../services/alertPrefsStore';
import type { AlertPrefs } from '../model/alertPrefs';
import { Cap, OstiaRpc } from '../services/rpc';
import { useCaps, useConnectionStatus } from '../services/workspaceStore';
import { colors, space, type } from '../theme';

const CONTRACT_VERSION = '1.4';

const ACCESS: { cap: Cap; title: string }[] = [
  { cap: 'read', title: 'See workspaces and terminals' },
  { cap: 'notify', title: 'Notifications' },
  { cap: 'input', title: 'Type in terminals' },
  { cap: 'command', title: 'Run Ostia commands' },
];

const STATE = { connected: 'Connected', connecting: 'Connecting…', disconnected: 'Offline', revoked: 'Removed' };

const ALERTS: { key: keyof AlertPrefs; title: string }[] = [
  { key: 'waiting', title: 'Agent needs you' },
  { key: 'done', title: 'Agent finished' },
  { key: 'failed', title: 'Agent failed' },
];

const TOGGLES: { key: keyof TerminalPrefs; title: string }[] = [
  { key: 'fitWhenWatching', title: 'Fit desktop width when watching' },
  { key: 'keyRow', title: 'Key row' },
  { key: 'haptics', title: 'Haptics' },
];

function Value({ text, mono: isMono }: { text: string; mono?: boolean }) {
  return (
    <Text style={[isMono ? type.mono : type.bodyMuted, styles.value]} numberOfLines={1} selectable>
      {text}
    </Text>
  );
}

export function SettingsScreen({ navigation, onUnpair }: ScreenProps<'Settings'> & { onUnpair: () => Promise<void> }) {
  const pairing = OstiaRpc.getPairing();
  const caps = useCaps();
  const status = useConnectionStatus();
  const prefs = usePrefs();
  const alerts = useAlertPrefs();
  const [permission, setPermission] = useState<boolean | null>(null);
  useEffect(() => {
    void Notifications.getPermissionsAsync().then((p) => setPermission(p.granted));
  }, []);
  const allow = async () => setPermission((await Notifications.requestPermissionsAsync()).granted);
  const name = pairing?.desktopName || 'Desktop';

  const confirmRemove = () =>
    Alert.alert(`Remove ${name}?`, 'Pair again to use it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void onUnpair() },
    ]);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: space.xxxl }}>
      <SectionHeader title="Desktop" />
      <Group>
        <ListRow title={name} trailing={<Value text={STATE[status]} />} />
        {pairing
          ? connectionRows(pairing).map((row) => (
              <ListRow key={row.title} title={row.title} trailing={<Value text={row.value} mono={row.mono} />} />
            ))
          : null}
        {pairing && routeLabel(pairing.gatewayHost) === 'Tailscale' ? (
          <ListRow title="Open Tailscale" onPress={() => void openTailscaleApp()} />
        ) : null}
        <ListRow title="Desktops" onPress={() => navigation.navigate('Desktops')} />
      </Group>

      <SectionHeader title="Access" />
      <Group>
        {ACCESS.map(({ cap, title }) => (
          <ListRow
            key={cap}
            title={title}
            trailing={
              caps.includes(cap) ? (
                <Check size={18} color={colors.fg} strokeWidth={2.5} />
              ) : (
                <Minus size={18} color={colors.dim} strokeWidth={2.25} />
              )
            }
          />
        ))}
      </Group>
      <Text style={[type.caption, styles.note]}>Change access in Settings › Remote on your desktop.</Text>

      <SectionHeader title="Notifications" />
      <Group>
      <ListRow
        title="Permission"
        trailing={
          permission === false ? (
            <View style={styles.stepper}>
              <Value text="Off" />
              <Button label="Allow" variant="text" compact onPress={() => void allow()} />
            </View>
          ) : (
            <Value text={permission ? 'On' : '…'} />
          )
        }
      />
      {ALERTS.map(({ key, title }) => (
          <ListRow
            key={key}
            title={title}
            trailing={
              <Switch
                accessibilityLabel={title}
                value={alerts[key]}
                onValueChange={(value) => setAlertPrefs({ [key]: value })}
                trackColor={{ true: colors.brand, false: colors.surfaceHigh }}
                thumbColor={colors.fg}
              />
            }
          />
      ))}
      </Group>
      <Text style={[type.caption, styles.note]}>
        {Platform.OS === 'ios'
          ? 'On iPhone, alerts arrive only while Ostia is open.'
          : 'While agents run, Ostia keeps a quiet notification so alerts reach you.'}
      </Text>

      <SectionHeader title="Terminal" />
      <Group>
        <ListRow
          title="Text size"
          trailing={
            <View style={styles.stepper}>
              <IconButton icon={Minus} variant="tonal" label="Smaller text" onPress={() => setPrefs({ fontSize: prefs.fontSize - 1 })} />
              <Text style={styles.size}>{prefs.fontSize}</Text>
              <IconButton icon={Plus} variant="tonal" label="Larger text" onPress={() => setPrefs({ fontSize: prefs.fontSize + 1 })} />
            </View>
          }
        />
        {TOGGLES.map(({ key, title }) => (
          <ListRow
            key={key}
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
        ))}
      </Group>
      <Text style={[type.caption, styles.note]}>
        Text size {MIN_FONT_SIZE}–{MAX_FONT_SIZE}. Applies to terminals on this phone.
      </Text>

      <SectionHeader title="About" />
      <Group>
        <ListRow title="Version" trailing={<Value text={Constants.expoConfig?.version ?? '—'} mono />} />
        <ListRow title="Contract" trailing={<Value text={CONTRACT_VERSION} mono />} />
        <ListRow title="Share connection log" onPress={() => void Share.share({ message: connectionLogText() })} />
      </Group>

      <Button label="Remove this desktop" variant="danger" onPress={confirmRemove} style={styles.remove} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  value: { maxWidth: 200, textAlign: 'right' },
  note: { paddingHorizontal: space.gutter, paddingTop: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  size: { ...type.monoLabel, minWidth: 24, textAlign: 'center' },
  remove: { marginHorizontal: space.gutter, marginTop: space.xxl },
});
