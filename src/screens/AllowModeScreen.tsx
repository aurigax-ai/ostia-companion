import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Circle, CircleDot, Square, SquareCheck } from 'lucide-react-native';
import { Group, ListRow, Meta, SectionHeader, NO_SCROLL_BARS } from '../components/ui';
import { AllowMode, PhoneControlPrefs, toggleChosen } from '../model/phoneControlPrefs';
import { failureText } from '../model/phoneSession';
import { ScreenProps } from '../navigation';
import { setPhoneControl, usePhoneControl } from '../services/phoneControlStore';
import { confirmWithFingerprint } from '../services/phoneSession';
import { showSnackbar } from '../services/snackbar';
import { useWorkspaces } from '../services/workspaceStore';
import { colors, space, type } from '../theme';

export const MODES: { mode: AllowMode; title: string; subtitle: string }[] = [
  { mode: 'ask', title: 'Ask every time', subtitle: 'Every request shows the sheet first' },
  { mode: 'chosen', title: 'Allow from chosen workspaces', subtitle: "These skip Ostia's question; others still ask" },
  { mode: 'off', title: 'Off', subtitle: 'Every request is declined, and the agent is told' },
];

export async function changePhoneControl(current: PhoneControlPrefs, patch: Partial<PhoneControlPrefs>): Promise<boolean> {
  if (current.fingerprint) {
    const failure = await confirmWithFingerprint('Change who may use this phone');
    if (failure) {
      showSnackbar(failureText(failure));
      return false;
    }
  }
  setPhoneControl(patch);
  return true;
}

export function AllowModeScreen(_: ScreenProps<'AllowMode'>) {
  const prefs = usePhoneControl();
  const { sessions } = useWorkspaces();
  const workspaces = sessions.filter((session) => session.kind !== 'scratch' && session.kind !== 'manager');
  return (
    <ScrollView {...NO_SCROLL_BARS} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Group>
        {MODES.map(({ mode, title, subtitle }) => {
          const Radio = prefs.mode === mode ? CircleDot : Circle;
          return (
            <ListRow
              key={mode}
              label={title}
              leading={<Radio size={20} color={prefs.mode === mode ? colors.brand : colors.muted} strokeWidth={2.25} />}
              title={title}
              subtitle={subtitle}
              chevron={false}
              onPress={() => prefs.mode !== mode && void changePhoneControl(prefs, { mode })}
            />
          );
        })}
      </Group>
      {prefs.mode === 'chosen' ? (
        <>
          <SectionHeader title="Chosen workspaces" trailing={<Meta text={String(prefs.chosen.length)} />} />
          <Group>
            {workspaces.map((session) => {
              const ticked = prefs.chosen.includes(session.sessionId);
              const Box = ticked ? SquareCheck : Square;
              return (
                <ListRow
                  key={session.sessionId}
                  label={`${session.name}, ${ticked ? 'chosen' : 'not chosen'}`}
                  leading={<Box size={20} color={ticked ? colors.brand : colors.muted} strokeWidth={2.25} />}
                  title={session.name}
                  trailing={session.group ? <Meta text={session.group.name} /> : null}
                  chevron={false}
                  onPress={() => void changePhoneControl(prefs, { chosen: toggleChosen(prefs, session.sessionId).chosen })}
                />
              );
            })}
          </Group>
        </>
      ) : null}
      <Text style={[type.caption, styles.note]}>
        Android still shows its own sharing dialog every time; no setting can skip it. This choice stays on this phone and is
        never sent to the desktop.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.lg, paddingBottom: space.xxxl },
  note: { paddingHorizontal: space.gutter, paddingTop: space.md },
});
