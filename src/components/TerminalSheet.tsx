import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { Pane, paneStatus, paneTitle } from '../model/workspaces';
import { colors, elevation, radius, space } from '../theme';
import { Group, IconTile, ListRow, SectionHeader, StatusPill, TILE_INSET, terminalIcon } from './ui';

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
      <View style={[styles.sheet, { paddingBottom: space.lg + insets.bottom }]}>
        <View style={styles.handle} />
        <SectionHeader title={workspace} />
        <Group inset={TILE_INSET}>
          {terminals.map((pane) => (
            <ListRow
              key={pane.paneId}
              leading={<IconTile icon={terminalIcon(pane)} />}
              title={paneTitle(pane)}
              trailing={
                <View style={styles.trailing}>
                  <StatusPill status={paneStatus(pane)} />
                  {pane.paneId === currentId ? (
                    <View accessible accessibilityLabel="Current">
                      <Check size={18} color={colors.brand} strokeWidth={2.5} />
                    </View>
                  ) : (
                    <View style={styles.checkSpace} />
                  )}
                </View>
              }
              onPress={() => onChoose(pane)}
            />
          ))}
        </Group>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: space.sm,
    boxShadow: elevation.sheet,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  checkSpace: { width: 18 },
});
