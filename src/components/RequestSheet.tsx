import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { Level } from '../model/phoneControlPrefs';
import { SESSION_LIMITS, SessionLimit } from '../model/phoneSession';
import { usePhoneControl } from '../services/phoneControlStore';
import { accessibilityEnabled, openAccessibilitySettings } from '../services/phoneSession';
import { allowRequest, denyRequest, usePendingRequest } from '../services/screenRequests';
import { colors, radius, space, type } from '../theme';
import { Button, Segmented, Sheet, Warning } from './ui';

const LEVELS: { value: Level; label: string }[] = [
  { value: 'view', label: 'View only' },
  { value: 'control', label: 'View and tap' },
];

const LIMITS = SESSION_LIMITS.map((minutes) => ({ value: minutes, label: `${minutes} min` }));

export function RequestSheet() {
  const request = usePendingRequest();
  const defaults = usePhoneControl();
  const [level, setLevel] = useState<Level>(defaults.level);
  const [limit, setLimit] = useState<SessionLimit>(defaults.limit);
  const [service, setService] = useState(accessibilityEnabled);

  useEffect(() => {
    if (!request) return;
    setLevel(defaults.level);
    setLimit(defaults.limit);
    setService(accessibilityEnabled());
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && setService(accessibilityEnabled()));
    return () => subscription.remove();
  }, [request, defaults.level, defaults.limit]);

  const shown = !!request && !request.skipSheet;

  return (
    <Sheet visible={shown} onClose={denyRequest}>
      {request ? (
        <View style={styles.body}>
          <Text style={type.title}>{request.title}</Text>
          {request.reason ? (
            <View style={styles.reason}>
              <Text style={type.caption}>Its reason</Text>
              <Text style={[type.body, styles.reasonText]}>{request.reason}</Text>
            </View>
          ) : null}
          <Text style={[type.label, styles.label]}>Level</Text>
          <Segmented label="Level" options={LEVELS} value={level} onChange={setLevel} />
          <Text style={[type.label, styles.label]}>Time limit</Text>
          <Segmented label="Time limit" options={LIMITS} value={limit} onChange={setLimit} />
          {service ? (
            <View style={styles.note}>
              <Info size={16} color={colors.muted} strokeWidth={2.25} />
              <Text style={[type.caption, styles.noteText]}>Next, Android asks you to share your screen.</Text>
            </View>
          ) : (
            <Warning
              text="Turn on Ostia phone control in Android's accessibility settings first. Without it the desktop sees only black."
              actions={<Button label="Open settings" variant="text" compact onPress={openAccessibilitySettings} />}
            />
          )}
          <View style={styles.actions}>
            <Button label="Deny" variant="tonal" compact onPress={denyRequest} />
            <Button label="Allow" compact disabled={!service} onPress={() => void allowRequest({ level, limit })} />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xs, gap: space.xs },
  reason: { marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceHigh },
  reasonText: { marginTop: space.xs },
  label: { marginTop: space.md, marginBottom: space.xs, color: colors.muted },
  note: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  noteText: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.lg },
});
