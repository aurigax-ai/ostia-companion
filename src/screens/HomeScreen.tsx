import React, { useLayoutEffect, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Settings } from 'lucide-react-native';
import { Button, Divider, Empty, HeaderIcon, ListRow, Loading, SectionHeader, StatusPill } from '../components/ui';
import { ConnectionBanner, LoadedAt } from '../components/ConnectionBanner';
import { InboxItem, Session, needsYou, paneTitle, shortPath, workspaceStatus } from '../model/workspaces';
import { ScreenProps } from '../navigation';
import { OstiaRpc } from '../services/rpc';
import { refreshWorkspaces, useConnectionStatus, useWorkspaces } from '../services/workspaceStore';
import { colors, mono, type } from '../theme';

type Row = { kind: 'inbox'; item: InboxItem } | { kind: 'workspace'; session: Session };

const STATUS = {
  connected: { text: 'Connected', color: colors.ok },
  connecting: { text: 'Connecting…', color: colors.brand },
  disconnected: { text: 'Offline', color: colors.attn },
  revoked: { text: 'Removed', color: colors.attn },
};

export function HomeScreen({ navigation, onUnpair }: ScreenProps<'Home'> & { onUnpair: () => Promise<void> }) {
  const { sessions, panes, loading, refreshing, loadedAt } = useWorkspaces();
  const status = useConnectionStatus();
  const [pairing] = useState(() => OstiaRpc.getPairing());
  const desktop = pairing?.desktopName || 'Ostia desktop';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View>
          <Text style={type.title} numberOfLines={1}>
            {desktop}
          </Text>
          <View style={styles.status}>
            <View style={[styles.dot, { backgroundColor: STATUS[status].color }]} />
            <Text style={type.caption}>{STATUS[status].text}</Text>
          </View>
        </View>
      ),
      headerRight: () => (
        <HeaderIcon icon={Settings} label="Settings" onPress={() => navigation.navigate('Settings')} />
      ),
    });
  }, [navigation, desktop, status]);

  const sections = useMemo(() => {
    const inbox = needsYou(sessions, panes);
    const list: { key: string; data: Row[] }[] = [];
    if (inbox.length > 0) list.push({ key: 'inbox', data: inbox.map((item) => ({ kind: 'inbox', item })) });
    if (sessions.length > 0) {
      list.push({ key: 'workspaces', data: sessions.map((session) => ({ kind: 'workspace', session })) });
    }
    return list;
  }, [sessions, panes]);

  if (loading) return <Loading label={`Loading ${desktop}…`} />;

  const openPane = (paneId: string, title: string) => navigation.navigate('Terminal', { paneId, title });

  return (
    <SectionList
      sections={sections}
      keyExtractor={(row) => (row.kind === 'inbox' ? `inbox:${row.item.pane.paneId}` : row.session.sessionId)}
      ListHeaderComponent={
        <ConnectionBanner
          status={status}
          host={pairing?.gatewayHost ?? ''}
          desktop={desktop}
          onPairAgain={() => void onUnpair()}
        />
      }
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refreshWorkspaces(true)}
          colors={[colors.brand]}
          progressBackgroundColor={colors.surface}
          tintColor={colors.brand}
        />
      }
      renderSectionHeader={({ section }) =>
        section.key === 'inbox' ? (
          <SectionHeader
            title="Needs you"
            tone="attn"
            trailing={<Text style={[type.caption, styles.count]}>{section.data.length}</Text>}
          />
        ) : (
          <SectionHeader
            title="Workspaces"
            trailing={status === 'connected' ? null : <LoadedAt at={loadedAt} />}
          />
        )
      }
      ItemSeparatorComponent={({ leadingItem }) => (leadingItem?.kind === 'workspace' ? <Divider /> : null)}
      ListEmptyComponent={
        status === 'connected' ? (
          <Empty title="No workspaces" body={`Open a workspace in Ostia on ${desktop} and it shows up here.`} />
        ) : null
      }
      renderItem={({ item: row }) => {
        if (row.kind === 'inbox') {
          const { pane, workspace, reason } = row.item;
          const title = paneTitle(pane);
          return (
            <View style={styles.card}>
              <Text style={styles.meta} numberOfLines={1}>
                <Text style={{ color: colors.attn }}>● </Text>
                {[workspace, pane.agent && pane.agent !== 'other' ? pane.agent : title].filter(Boolean).join(' · ')}
              </Text>
              <Text style={[type.body, styles.message]}>{reason}</Text>
              <View style={styles.cardActions}>
                <Button
                  label="Open"
                  compact
                  variant={pane.agentState === 'waiting' ? 'filled' : 'tonal'}
                  onPress={() => openPane(pane.paneId, title)}
                />
              </View>
            </View>
          );
        }
        const { session } = row;
        const sessionPanes = panes.filter((pane) => pane.sessionId === session.sessionId);
        return (
          <ListRow
            title={session.name || 'Untitled workspace'}
            subtitle={shortPath(session.workDir)}
            mono
            trailing={<StatusPill status={workspaceStatus(session, sessionPanes)} />}
            onPress={() => navigation.navigate('Workspace', { sessionId: session.sessionId, name: session.name })}
          />
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  count: {
    color: colors.attn,
    backgroundColor: colors.attnSoft,
    fontWeight: '600',
    borderRadius: 8,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  meta: { fontFamily: mono, fontSize: 12, lineHeight: 16, color: colors.muted },
  message: { marginTop: 8 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
});
