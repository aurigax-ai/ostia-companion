import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Play, Square } from 'lucide-react-native';
import { Button, Card, Group, ListRow, SectionHeader, Warning } from '../components/ui';
import {
  DEFAULT_LIMIT,
  failureText,
  isActive,
  SESSION_LIMITS,
  SessionLimit,
  startBlock,
  stoppedText,
  timeLeft,
} from '../model/phoneSession';
import { ScreenProps } from '../navigation';
import { phoneControlSupported, startPhoneSession, stopPhoneSession, usePhoneSession } from '../services/phoneSession';
import { OstiaRpc } from '../services/rpc';
import { useConnectionStatus } from '../services/workspaceStore';
import { space, type } from '../theme';

const BLOCKS = {
  unsupported: 'This phone cannot be shared: it needs Android 10 or later and this build of Ostia.',
  offline: 'Connect to the desktop first.',
  running: null,
};

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function PhoneSessionScreen({ route }: ScreenProps<'PhoneSession'>) {
  const { sessionId, name } = route.params;
  const session = usePhoneSession();
  const connected = useConnectionStatus() === 'connected';
  const desktop = OstiaRpc.getPairing()?.desktopName || 'your desktop';
  const active = isActive(session.state);
  const now = useNow(active);
  const [limit, setLimit] = useState<SessionLimit>(DEFAULT_LIMIT);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const block = startBlock({ supported: phoneControlSupported(), connected, active });

  const start = async () => {
    setProblem(null);
    setStarting(true);
    try {
      const failure = await startPhoneSession(sessionId, name, limit);
      if (failure) setProblem(failureText(failure));
    } finally {
      setStarting(false);
    }
  };

  if (active) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.live}>
          <Text style={type.headline}>{session.state === 'starting' ? 'Connecting…' : `${desktop} can see this screen`}</Text>
          <Text style={[type.bodyMuted, styles.gap]}>
            {name} · {timeLeft(session.endsAt, now)}
          </Text>
          <Button label="Stop" icon={Square} variant="danger" onPress={stopPhoneSession} style={styles.liveAction} />
        </Card>
        <Text style={[type.caption, styles.note]}>Stop is also in the notification. Nothing is kept when the session ends.</Text>
      </ScrollView>
    );
  }

  const ended = session.state === 'stopped' && session.reason !== 'stop-phone' ? stoppedText(session.reason) : null;
  const warning = problem ?? ended ?? (block ? BLOCKS[block] : null);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[type.bodyMuted, styles.intro]}>An agent on {desktop} will see this screen while the session runs.</Text>
      <Group>
        <ListRow title="Workspace" trailing={<Text style={type.mono}>{name}</Text>} />
      </Group>
      <SectionHeader title="Session ends after" />
      <View style={styles.chips} accessibilityRole="radiogroup">
        {SESSION_LIMITS.map((minutes) => (
          <Button
            key={minutes}
            label={`${minutes} min`}
            variant={minutes === limit ? 'filled' : 'tonal'}
            compact
            onPress={() => setLimit(minutes)}
            style={styles.chip}
          />
        ))}
      </View>
      <Text style={[type.caption, styles.note]}>
        Android asks before every session. Apps that mark their screens secure appear black. You can stop at any time from the
        notification.
      </Text>
      {warning ? <Warning text={warning} /> : null}
      <Button label="Start" icon={Play} loading={starting} disabled={block !== null} onPress={() => void start()} style={styles.action} />
      <Text style={[type.caption, styles.center]}>Asks for your fingerprint or PIN</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.lg, paddingBottom: space.xxxl, gap: space.sm },
  intro: { paddingHorizontal: space.gutter, paddingBottom: space.sm },
  chips: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.gutter },
  chip: { minHeight: 32, paddingHorizontal: space.md },
  note: { paddingHorizontal: space.gutter, paddingTop: space.sm },
  live: { padding: space.lg },
  gap: { marginTop: space.xs },
  action: { marginHorizontal: space.gutter, marginTop: space.xl },
  liveAction: { marginTop: space.lg },
  center: { textAlign: 'center' },
});
