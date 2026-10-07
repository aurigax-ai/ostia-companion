import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Check, Monitor, Plus, X } from 'lucide-react-native';
import { Divider, IconTile, ListRow, tap } from '../components/ui';
import { DesktopList, EMPTY_DESKTOPS } from '../model/desktops';
import { routeLabel } from '../model/connectionInfo';
import { ScreenProps } from '../navigation';
import { removeDesktopAndReconnect, switchDesktop } from '../services/desktopSession';
import { loadDesktops } from '../services/storage';
import { colors } from '../theme';

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
    <FlatList
      data={list.desktops}
      keyExtractor={(desktop) => desktop.deviceId}
      ItemSeparatorComponent={() => <Divider inset={72} />}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
      renderItem={({ item: desktop }) => (
        <ListRow
          leading={<IconTile icon={Monitor} />}
          title={desktop.desktopName}
          subtitle={`${routeLabel(desktop.gatewayHost)} · ${desktop.gatewayHost}`}
          mono
          trailing={
            <View style={styles.trailing}>
              {desktop.deviceId === list.activeId ? <Check size={20} color={colors.brand} /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${desktop.desktopName}`}
                hitSlop={8}
                onPress={() => (tap(), remove(desktop.deviceId, desktop.desktopName))}
                style={styles.remove}
              >
                <X size={18} color={colors.dim} />
              </Pressable>
            </View>
          }
          onPress={() => void choose(desktop.deviceId)}
        />
      )}
      ListFooterComponent={
        <>
          <Divider inset={72} />
          <ListRow leading={<IconTile icon={Plus} tone="ghost" />} title="Add desktop" onPress={() => navigation.navigate('Pair')} />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  remove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
