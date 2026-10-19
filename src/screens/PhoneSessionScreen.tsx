import React, { useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Play, Square } from 'lucide-react-native';
import { Button, Card, Group, ListRow, SectionHeader, Warning } from '../components/ui';
import { blockedSummary } from '../model/blockedApps';
import {
  DEFAULT_LIMIT,
  failureText,
  isActive,
  pausedText,
  SESSION_LIMITS,
  SessionLimit,
  startBlock,
  stoppedText,
  timeLeft,
} from '../model/phoneSession';
import { ScreenProps } from '../navigation';
import {
  accessibilityEnabled,
  openAccessibilitySettings,
  phoneControlSupported,
  resumePhoneSession,
  startPhoneSession,
  stopPhoneSession,
  usePhoneSession,
} from '../services/phoneSession';
import { useBlockedApps } from '../services/blockedAppsStore';
import { OstiaRpc } from '../services/rpc';
import { useConnectionStatus } from '../services/workspaceStore';
import { space, type } from '../theme';

const BLOCKS = {
  unsupported: 'This phone cannot be shared: it needs Android 10 or later and this build of Ostia.',
  offline: 'Connect to the desktop first.',
  running: null,
  'service-off': null,
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

function useAccessibility() {
  const [enabled, setEnabled] = useState(accessibilityEnabled);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && setEnabled(accessibilityEnabled()));
    return () => subscription.remove();
  }, []);
  return enabled;
}

export function PhoneSessionScreen({ navigation, route }: ScreenProps<'PhoneSession'>) {
  const { sessionId, name } = route.params;
  const session = usePhoneSession();
  const connected = useConnectionStatus() === 'connected';
  const taps = useAccessibility();
  const blockedCount = useBlockedApps().length;
  const desktop = OstiaRpc.getPairing()?.desktopName || 'your desktop';
  const active = isActive(session.state);
  const now = useNow(active);
  const [limit, setLimit] = useState<SessionLimit>(DEFAULT_LIMIT);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const block = startBlock({ supported: phoneControlSupported(), connected, active, serviceOn: taps });

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
    const paused = session.state === 'paused';
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.live}>
          <Text style={type.headline}>
            {session.state === 'starting' ? 'Connecting…' : paused ? pausedText(session.reason) : `${desktop} can see this screen`}
          </Text>
          <Text style={[type.bodyMuted, styles.gap]}>
            {name} · {timeLeft(session.endsAt, now)}
          </Text>
          {paused ? <Button label="Resume" icon={Play} onPress={resumePhoneSession} style={styles.liveAction} /> : null}
          <Button label="Stop" icon={Square} variant="danger" onPress={stopPhoneSession} style={paused ? styles.gapLarge : styles.liveAction} />
        </Card>
        <Text style={[type.caption, styles.note]}>
          Touching the screen pauses the agent until you resume. Stop is also in the notification. Nothing is kept when the session
          ends.
        </Text>
      </ScrollView>
    );
  }

  const ended = session.state === 'stopped' && session.reason !== 'stop-phone' ? stoppedText(session.reason) : null;
  const warning = problem ?? ended ?? (block ? BLOCKS[block] : null);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[type.bodyMuted, styles.intro]}>
        {`An agent on ${desktop} will see this screen and tap and type on it while the session runs.`}
      </Text>
      <Group>
        <ListRow title="Workspace" trailing={<Text style={type.mono}>{name}</Text>} />
        <ListRow
          title="Phone control"
          trailing={
            taps ? (
              <Text style={type.bodyMuted}>On</Text>
            ) : (
              <Button label="Turn on" variant="text" compact onPress={openAccessibilitySettings} />
            )
          }
        />
      </Group>
      {taps ? null : (
        <Text style={[type.caption, styles.note]}>
          Turn on Ostia phone control in Android's accessibility settings, once. The phone needs it to tap and type, and to keep
          the apps you never share out of every picture: without it the desktop sees only black, even to watch. It acts only
          during a session you start here.
        </Text>
      )}
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
      <SectionHeader title="Never opened by the agent" />
      <Group>
        <ListRow title={blockedSummary(blockedCount)} onPress={() => navigation.navigate('BlockedApps')} />
      </Group>
      <Text style={[type.caption, styles.note]}>
        Android asks before every session. Apps that mark their screens secure appear black. Touching the screen pauses the
        agent. You can stop at any time from the bar at the top or the notification.
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
  gapLarge: { marginTop: space.sm },
  action: { marginHorizontal: space.gutter, marginTop: space.xl },
  liveAction: { marginTop: space.lg },
  center: { textAlign: 'center' },
});
