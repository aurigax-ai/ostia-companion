import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Check, Monitor, Plus, X } from 'lucide-react-native';
import { Group, IconTile, ListRow, TILE_INSET, tap } from '../components/ui';
import { DesktopList, EMPTY_DESKTOPS } from '../model/desktops';
import { routeLabel } from '../model/connectionInfo';
import { ScreenProps } from '../navigation';
import { removeDesktopAndReconnect, switchDesktop } from '../services/desktopSession';
import { loadDesktops } from '../services/storage';
import { colors, space } from '../theme';

export function DesktopsScreen({ navigation, onEmpty }: ScreenProps<'Desktops'> & { onEmpty: () => void }) {
  const [list, setList] = useState<DesktopList>(EMPTY_DESKTOPS);

  useFocusEffect(
    useCallback(() => {
      void loadDesktops().then(setList);
    }, []),
  );

  const choose = async (deviceId: string) => {
    if (deviceId !== list.activeId) await switchDesktop(deviceId);
    navigation.goBack();
  };

  const remove = (deviceId: string, name: string) =>
    Alert.alert(`Remove ${name}?`, 'Pair again to use it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (!(await removeDesktopAndReconnect(deviceId))) return onEmpty();
          setList(await loadDesktops());
        },
      },
    ]);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Group inset={TILE_INSET}>
        {list.desktops.map((desktop) => (
          <ListRow
            key={desktop.deviceId}
            leading={<IconTile icon={Monitor} tone={desktop.deviceId === list.activeId ? 'brand' : 'neutral'} />}
            title={desktop.desktopName}
            subtitle={`${routeLabel(desktop.gatewayHost)} · ${desktop.gatewayHost}`}
            mono
            trailing={
              <View style={styles.trailing}>
                {desktop.deviceId === list.activeId ? <Check size={18} color={colors.brand} strokeWidth={2.5} /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${desktop.desktopName}`}
                  hitSlop={8}
                  onPress={() => (tap(), remove(desktop.deviceId, desktop.desktopName))}
                  style={styles.remove}
                >
                  <X size={16} color={colors.dim} strokeWidth={2.25} />
                </Pressable>
              </View>
            }
            onPress={() => void choose(desktop.deviceId)}
          />
        ))}
        <ListRow leading={<IconTile icon={Plus} tone="ghost" />} title="Add desktop" onPress={() => navigation.navigate('Pair')} />
      </Group>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, paddingBottom: space.xxl },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  remove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
