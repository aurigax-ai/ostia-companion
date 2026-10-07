import React from 'react';
import { Text } from 'react-native';
import { connectionNotice } from '../services/connectionNotice';
import { openTailscaleApp } from '../services/openTailscaleApp';
import { ConnectionStatus, OstiaRpc } from '../services/rpc';
import { type } from '../theme';
import { Button, Warning } from './ui';

export function ConnectionBanner({
  status,
  host,
  desktop,
  onPairAgain,
}: {
  status: ConnectionStatus;
  host: string;
  desktop: string;
  onPairAgain: () => void;
}) {
  const notice = connectionNotice(status, host, desktop);
  if (!notice) return null;
  return (
    <Warning
      text={notice.text}
      actions={notice.actions.map((action) =>
        action === 'open-tailscale' ? (
          <Button key={action} label="Open Tailscale" variant="text" compact onPress={() => void openTailscaleApp()} />
        ) : action === 'retry' ? (
          <Button key={action} label="Retry" variant="text" compact onPress={() => OstiaRpc.retry()} />
        ) : (
          <Button key={action} label="Pair again" variant="text" compact onPress={onPairAgain} />
        ),
      )}
    />
  );
}

export function LoadedAt({ at }: { at: number | null }) {
  if (at === null) return null;
  const time = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return <Text style={type.caption}>as of {time}</Text>;
}
