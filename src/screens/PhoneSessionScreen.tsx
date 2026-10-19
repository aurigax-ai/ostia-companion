import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Play, Smartphone, Square } from 'lucide-react-native';
import { Button, Card, Empty } from '../components/ui';
import { isActive, pausedText, stoppedText, timeLeft } from '../model/phoneSession';
import { ScreenProps } from '../navigation';
import { resumePhoneSession, stopPhoneSession, usePhoneSession } from '../services/phoneSession';
import { OstiaRpc } from '../services/rpc';
import { useNow } from '../services/useNow';
import { useWorkspaces } from '../services/workspaceStore';
import { space, type } from '../theme';

export function PhoneSessionScreen(_: ScreenProps<'PhoneSession'>) {
  const session = usePhoneSession();
  const desktop = OstiaRpc.getPairing()?.desktopName || 'your desktop';
  const active = isActive(session.state);
  const now = useNow(1000, active);
  const workspace = useWorkspaces().sessions.find((item) => item.sessionId === session.sessionId)?.name ?? 'a workspace';

  if (!active) {
    const ended = session.state === 'stopped' ? stoppedText(session.reason) : 'No agent is using this phone.';
    return <Empty icon={Smartphone} title="Phone control is off" body={`${ended} An agent asks when a job needs this phone.`} />;
  }

  const paused = session.state === 'paused';
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card style={styles.live}>
        <Text style={type.headline}>
          {session.state === 'starting' ? 'Connecting…' : paused ? pausedText(session.reason) : `${desktop} can see this screen`}
        </Text>
        <Text style={[type.bodyMuted, styles.gap]}>
          {workspace} · {timeLeft(session.endsAt, now)}
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

const styles = StyleSheet.create({
  content: { paddingTop: space.lg, paddingBottom: space.xxxl, gap: space.sm },
  note: { paddingHorizontal: space.gutter, paddingTop: space.sm },
  live: { padding: space.lg },
  gap: { marginTop: space.xs },
  gapLarge: { marginTop: space.sm },
  liveAction: { marginTop: space.lg },
});
