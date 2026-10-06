import React from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { Check, Minus } from 'lucide-react-native';
import { Button, Divider, ListRow, SectionHeader } from '../components/ui';
import { ScreenProps } from '../navigation';
import { Cap, OstiaRpc } from '../services/rpc';
import { openTailscaleApp } from '../services/openTailscaleApp';
import { useCaps, useConnectionStatus } from '../services/workspaceStore';
import { colors, type } from '../theme';

const PERMISSIONS: { cap: Cap; title: string; body: string }[] = [
  { cap: 'read', title: 'See workspaces', body: 'Workspaces, panes and terminal output' },
  { cap: 'notify', title: 'Notifications', body: 'When an agent needs you or finishes' },
  { cap: 'input', title: 'Type in terminals', body: 'Keys and resizing from this phone' },
  { cap: 'command', title: 'Run commands', body: 'Ostia commands such as split or new tab' },
];

const STATUS_TEXT = {
  connected: 'Connected',
  connecting: 'Connecting…',
  disconnected: 'Offline',
  revoked: 'Removed by the desktop',
};

export function SettingsScreen({ onUnpair }: ScreenProps<'Settings'> & { onUnpair: () => Promise<void> }) {
  const pairing = OstiaRpc.getPairing();
  const caps = useCaps();
  const status = useConnectionStatus();

  const confirmUnpair = () =>
    Alert.alert(
      'Disconnect this phone?',
      `This phone forgets ${pairing?.desktopName || 'the desktop'}. To connect again, scan a new QR code from Ostia Settings → Remote.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: () => void onUnpair() },
      ],
    );

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <SectionHeader title="Desktop" />
      <ListRow title={pairing?.desktopName || 'Ostia desktop'} subtitle={STATUS_TEXT[status]} />
      <Divider inset={16} />
      <ListRow title="Address" subtitle={pairing ? `${pairing.gatewayHost}:${pairing.gatewayPort}` : ''} mono />
      <Divider inset={16} />
      <ListRow title="Tailscale" subtitle="Open the Tailscale app on this phone" onPress={() => void openTailscaleApp()} />

      <SectionHeader title="What this phone may do" />
      {PERMISSIONS.map(({ cap, title, body }, index) => {
        const granted = caps.includes(cap);
        const Icon = granted ? Check : Minus;
        return (
          <React.Fragment key={cap}>
            {index > 0 ? <Divider inset={16} /> : null}
            <ListRow
              title={title}
              subtitle={body}
              trailing={<Icon size={20} color={granted ? colors.ok : colors.dim} />}
            />
          </React.Fragment>
        );
      })}
      <Text style={[type.caption, { paddingHorizontal: 16, paddingTop: 8 }]}>
        Change these on your desktop in Ostia Settings → Remote.
      </Text>

      <Button label="Disconnect this phone" variant="danger" onPress={confirmUnpair} style={{ margin: 16, marginTop: 32 }} />
    </ScrollView>
  );
}
