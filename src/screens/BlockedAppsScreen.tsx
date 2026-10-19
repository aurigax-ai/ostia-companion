import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Switch, Text } from 'react-native';
import { Divider, ListRow } from '../components/ui';
import { phoneApps } from '../services/phoneSession';
import { setBlocked, useBlockedApps } from '../services/blockedAppsStore';
import { colors, space, type } from '../theme';

export function BlockedAppsScreen() {
  const apps = useMemo(phoneApps, []);
  const blocked = useBlockedApps();

  return (
    <FlatList
      data={apps}
      keyExtractor={(app) => app.package}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <Text style={[type.caption, styles.note]}>
          The agent never opens or sees these apps. Password managers, authenticators and payment apps are always on the list.
          Add your bank here.
        </Text>
      }
      ItemSeparatorComponent={() => <Divider />}
      renderItem={({ item: app }) => {
        const on = app.alwaysBlocked || blocked.includes(app.package);
        return (
          <ListRow
            title={app.label}
            subtitle={app.alwaysBlocked ? 'Always' : app.package}
            mono={!app.alwaysBlocked}
            trailing={
              <Switch
                accessibilityLabel={`Never open ${app.label}`}
                value={on}
                disabled={app.alwaysBlocked}
                onValueChange={(value) => setBlocked(app.package, value)}
                trackColor={{ true: colors.brand, false: colors.surfaceHigh }}
                thumbColor={colors.fg}
              />
            }
          />
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xxxl },
  note: { paddingHorizontal: space.gutter, paddingVertical: space.md },
});
