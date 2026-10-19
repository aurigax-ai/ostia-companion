import React, { useEffect, useState } from 'react';
import { Alert, AppState, Platform, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Check, Minus, Plus } from 'lucide-react-native';
import { Button, Group, IconButton, ListRow, SectionHeader, Sheet, SnackbarHost, useTabBarInset } from '../components/ui';
import { Level } from '../model/phoneControlPrefs';
import { SESSION_LIMITS, SessionLimit } from '../model/phoneSession';
import { connectionRows, routeLabel } from '../model/connectionInfo';
import { MAX_FONT_SIZE, MIN_FONT_SIZE, TerminalPrefs } from '../model/prefs';
import { TabProps } from '../navigation';
import { usePhoneControl } from '../services/phoneControlStore';
import { accessibilityEnabled, openAccessibilitySettings, phoneControlSupported } from '../services/phoneSession';
import { useBlockedApps } from '../services/blockedAppsStore';
import { blockedSummary } from '../model/blockedApps';
import { changePhoneControl, MODES } from './AllowModeScreen';
import { connectionLogText } from '../services/connectionLog';
import { openTailscaleApp } from '../services/openTailscaleApp';
import { setPrefs, usePrefs } from '../services/prefsStore';
import { setAlertPrefs, useAlertPrefs } from '../services/alertPrefsStore';
import type { AlertPrefs } from '../model/alertPrefs';
import { Cap, OstiaRpc } from '../services/rpc';
import { useCaps, useConnectionStatus } from '../services/workspaceStore';
import { colors, space, type } from '../theme';

const CONTRACT_VERSION = '1.8';

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

const LEVELS: { value: Level; label: string }[] = [
  { value: 'control', label: 'View and tap' },
  { value: 'view', label: 'View only' },
];

type Choosing = null | 'level' | 'limit';

function useAccessibility() {
  const [enabled, setEnabled] = useState(accessibilityEnabled);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && setEnabled(accessibilityEnabled()));
    return () => subscription.remove();
  }, []);
  return enabled;
}

function PhoneControlSection({ onAllowMode, onBlockedApps }: { onAllowMode: () => void; onBlockedApps: () => void }) {
  const control = usePhoneControl();
  const service = useAccessibility();
  const blocked = useBlockedApps().length;
  const [choosing, setChoosing] = useState<Choosing>(null);
  if (!phoneControlSupported()) {
    return (
      <>
        <SectionHeader title="Phone control" />
        <Group>
          <ListRow title="Use this phone" subtitle={Platform.OS === 'ios' ? 'Not available on iPhone' : 'Not available on this phone'} disabled />
        </Group>
        <Text style={[type.caption, styles.note]}>
          {Platform.OS === 'ios'
            ? 'iOS lets no app see or tap another app, so agents cannot use this iPhone.'
            : 'Phone control needs Android 10 or later and a build of Ostia that includes it.'}
        </Text>
      </>
    );
  }
  const choices =
    choosing === 'level'
      ? LEVELS.map((option) => ({ key: option.value, label: option.label, on: control.level === option.value, pick: () => void changePhoneControl(control, { level: option.value }) }))
      : SESSION_LIMITS.map((minutes: SessionLimit) => ({ key: String(minutes), label: `${minutes} minutes`, on: control.limit === minutes, pick: () => void changePhoneControl(control, { limit: minutes }) }));
  return (
    <>
      <SectionHeader title="Phone control" />
      <Group>
        <ListRow title="Allow agents to use this phone" subtitle={MODES.find((mode) => mode.mode === control.mode)?.title} onPress={onAllowMode} />
        <ListRow title="Default level" subtitle={LEVELS.find((level) => level.value === control.level)?.label} onPress={() => setChoosing('level')} />
        <ListRow title="Default time limit" subtitle={`${control.limit} minutes`} onPress={() => setChoosing('limit')} />
        <ListRow
          title="Require fingerprint"
          trailing={
            <Switch
              accessibilityLabel="Require fingerprint"
              value={control.fingerprint}
              onValueChange={(value) => void changePhoneControl(control, { fingerprint: value })}
              trackColor={{ true: colors.brand, false: colors.surfaceHigh }}
              thumbColor={colors.fg}
            />
          }
        />
        <ListRow
          title="Accessibility service"
          subtitle={service ? 'On · needed for taps, typing and what may show' : 'Off · the desktop sees only black'}
          attention={!service}
          onPress={openAccessibilitySettings}
        />
        <ListRow title="Never-opened apps" subtitle={blockedSummary(blocked)} onPress={onBlockedApps} />
      </Group>
      <Text style={[type.caption, styles.note]}>
        An agent asks when a job needs this phone. These settings stay on this phone; Android asks before every session.
      </Text>
      <Sheet visible={choosing !== null} onClose={() => setChoosing(null)}>
        <Group>
          {choices.map((choice) => (
            <ListRow
              key={choice.key}
              title={choice.label}
              trailing={choice.on ? <Check size={18} color={colors.brand} strokeWidth={2.5} /> : null}
              chevron={false}
              onPress={() => (setChoosing(null), choice.pick())}
            />
          ))}
        </Group>
      </Sheet>
    </>
  );
}

export function SettingsScreen({ navigation, onUnpair }: TabProps<'Settings'> & { onUnpair: () => Promise<void> }) {
  const pairing = OstiaRpc.getPairing();
  const caps = useCaps();
  const status = useConnectionStatus();
  const prefs = usePrefs();
  const alerts = useAlertPrefs();
  const tabBar = useTabBarInset();
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
    <View style={{ flex: 1 }}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: space.xxxl + tabBar }}>
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

      <PhoneControlSection onAllowMode={() => navigation.navigate('AllowMode')} onBlockedApps={() => navigation.navigate('BlockedApps')} />

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
    <SnackbarHost bottom={tabBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  value: { maxWidth: 200, textAlign: 'right' },
  note: { paddingHorizontal: space.gutter, paddingTop: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  size: { ...type.monoLabel, minWidth: 24, textAlign: 'center' },
  remove: { marginHorizontal: space.gutter, marginTop: space.xxl },
});
