import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { Pane, paneStatus, paneTitle } from '../model/workspaces';
import { colors } from '../theme';
import { Divider, ListRow, SectionHeader, StatusPill } from './ui';

export function TerminalSheet({
  visible,
  workspace,
  terminals,
  currentId,
  onChoose,
  onClose,
}: {
  visible: boolean;
  workspace: string;
  terminals: Pane[];
  currentId: string;
  onChoose: (pane: Pane) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close terminal list" />
      <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.handle} />
        <SectionHeader title={workspace} />
        {terminals.map((pane, index) => (
          <React.Fragment key={pane.paneId}>
            {index > 0 ? <Divider /> : null}
            <ListRow
              title={paneTitle(pane)}
              trailing={
                <View style={styles.trailing}>
                  <StatusPill status={paneStatus(pane)} />
                  {pane.paneId === currentId ? (
                    <View accessible accessibilityLabel="Current">
                      <Check size={20} color={colors.brand} />
                    </View>
                  ) : (
                    <View style={styles.checkSpace} />
                  )}
                </View>
              }
              onPress={() => onChoose(pane)}
            />
          </React.Fragment>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkSpace: { width: 20 },
});
