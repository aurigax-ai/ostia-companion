import React, { useLayoutEffect, useMemo } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { BellRing, Settings } from 'lucide-react-native';
import { Avatar, Button, Divider, Empty, HeaderIcon, ListRow, Loading, Notice, SectionHeader } from '../components/ui';
import { InboxItem, Session, needsYou, paneSummary, paneTitle, shortPath } from '../model/workspaces';
import { ScreenProps } from '../navigation';
import { connectionNotice } from '../services/connectionNotice';
import { openTailscaleApp } from '../services/openTailscaleApp';
import { OstiaRpc } from '../services/rpc';
import { refreshWorkspaces, useConnectionStatus, useWorkspaces } from '../services/workspaceStore';
import { colors, type } from '../theme';

type Row = { kind: 'inbox'; item: InboxItem } | { kind: 'workspace'; session: Session };

const STATUS_TEXT = {
  connected: 'Connected',
  connecting: 'Connecting…',
  disconnected: 'Offline',
  revoked: 'Offline',
};

export function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  const { sessions, panes, loading, refreshing, error } = useWorkspaces();
  const status = useConnectionStatus();
  const pairing = OstiaRpc.getPairing();
  const notice = connectionNotice(status, pairing?.gatewayHost ?? '');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View>
          <Text style={type.title} numberOfLines={1}>
            {pairing?.desktopName || 'Ostia'}
          </Text>
          <View style={styles.status}>
            <View style={[styles.dot, { backgroundColor: status === 'connected' ? colors.ok : colors.warn }]} />
            <Text style={type.caption}>{STATUS_TEXT[status]}</Text>
          </View>
        </View>
      ),
      headerRight: () => (
        <HeaderIcon icon={Settings} label="Settings" onPress={() => navigation.navigate('Settings')} />
      ),
    });
  }, [navigation, pairing, status]);

  const sections = useMemo(() => {
    const inbox = needsYou(sessions, panes);
    const list: { title: string; tone: 'muted' | 'attn'; data: Row[] }[] = [];
    if (inbox.length > 0) {
      list.push({ title: 'Needs you', tone: 'attn', data: inbox.map((item) => ({ kind: 'inbox', item })) });
    }
    list.push({ title: 'Workspaces', tone: 'muted', data: sessions.map((session) => ({ kind: 'workspace', session })) });
    return list;
  }, [sessions, panes]);

  if (loading) return <Loading />;

  const header = notice ? (
    <Notice
      text={notice.text}
      actions={
        <>
          {notice.actions.includes('open-tailscale') ? (
            <Button label="Open Tailscale" variant="tonal" onPress={() => void openTailscaleApp()} />
          ) : null}
          {notice.actions.includes('pair-again') ? (
            <Button label="Pair again" variant="text" onPress={() => navigation.navigate('Settings')} />
          ) : null}
        </>
      }
    />
  ) : error ? (
    <Notice text={error} tone="attn" actions={<Button label="Retry" variant="tonal" onPress={() => void refreshWorkspaces()} />} />
  ) : null;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(row) => (row.kind === 'inbox' ? `inbox:${row.item.pane.paneId}` : row.session.sessionId)}
      ListHeaderComponent={header}
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
        section.data.length > 0 ? <SectionHeader title={section.title} tone={section.tone} /> : null
      }
      ItemSeparatorComponent={() => <Divider />}
      ListEmptyComponent={null}
      renderSectionFooter={({ section }) =>
        section.title === 'Workspaces' && section.data.length === 0 && status === 'connected' ? (
          <Empty title="No workspaces" body="Open a workspace in Ostia on your desktop and it shows up here." />
        ) : null
      }
      renderItem={({ item: row }) => {
        if (row.kind === 'inbox') {
          const { pane, workspace, reason } = row.item;
          return (
            <ListRow
              leading={<Avatar icon={BellRing} tone="attn" />}
              overline={workspace}
              title={paneTitle(pane)}
              subtitle={reason}
              onPress={() => navigation.navigate('Terminal', { paneId: pane.paneId, title: paneTitle(pane) })}
            />
          );
        }
        const { session } = row;
        const sessionPanes = panes.filter((pane) => pane.sessionId === session.sessionId);
        const busy = sessionPanes.some((pane) => pane.running);
        return (
          <ListRow
            leading={<Avatar letter={session.name} tone={toneFor(session)} />}
            title={session.name || 'Untitled workspace'}
            subtitle={shortPath(session.workDir)}
            trailing={
              <Text style={[type.caption, busy && { color: colors.brand }]}>{paneSummary(sessionPanes)}</Text>
            }
            onPress={() => navigation.navigate('Workspace', { sessionId: session.sessionId, name: session.name })}
          />
        );
      }}
    />
  );
}

function toneFor(session: Session): 'neutral' | 'brand' | 'attn' {
  if (session.state === 'waiting' || session.state === 'error') return 'attn';
  if (session.state === 'working') return 'brand';
  return 'neutral';
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
});
