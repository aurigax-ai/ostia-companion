import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, Settings } from 'lucide-react-native';
import { Button, Divider, Empty, HeaderIcon, ListRow, Loading, SectionHeader, StatusPill } from '../components/ui';
import { AskCard } from '../components/AskCard';
import { ConnectionBanner, LoadedAt } from '../components/ConnectionBanner';
import { Ask, needsYouItems } from '../model/asks';
import { answerAsk, useAsks } from '../services/askStore';
import { byAttention, homeSections, workspaceRank } from '../model/order';
import { InboxItem, Session, paneTitle, shortPath, workspaceStatus } from '../model/workspaces';
import { ScreenProps } from '../navigation';
import { OstiaRpc } from '../services/rpc';
import { refreshWorkspaces, useCaps, useConnectionStatus, useWorkspaces } from '../services/workspaceStore';
import { colors, mono, type } from '../theme';

type Row = { kind: 'ask'; ask: Ask } | { kind: 'inbox'; item: InboxItem } | { kind: 'workspace'; session: Session };

const STATUS = {
  connected: { text: 'Connected', color: colors.muted },
  connecting: { text: 'Connecting…', color: colors.brand },
  disconnected: { text: 'Offline', color: colors.attn },
  revoked: { text: 'Removed', color: colors.attn },
};

export function HomeScreen({ navigation, onUnpair }: ScreenProps<'Home'> & { onUnpair: () => Promise<void> }) {
  const { sessions, panes, loading, refreshing, loadedAt } = useWorkspaces();
  const status = useConnectionStatus();
  const asks = useAsks();
  const canRespond = useCaps().includes('respond');
  const live = OstiaRpc.getPairing();
  const last = useRef(live);
  if (live) last.current = live;
  const pairing = last.current;
  const desktop = pairing?.desktopName || 'Ostia desktop';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${desktop}, switch desktop`}
          onPress={() => navigation.navigate('Desktops')}
        >
          <View style={styles.titleRow}>
            <Text style={type.title} numberOfLines={1}>
              {desktop}
            </Text>
            <ChevronDown size={20} color={colors.muted} style={{ marginLeft: 4 }} />
          </View>
          <View style={styles.status}>
            <View style={[styles.dot, { backgroundColor: STATUS[status].color }]} />
            <Text style={type.caption}>{STATUS[status].text}</Text>
          </View>
        </Pressable>
      ),
      headerRight: () => (
        <HeaderIcon icon={Settings} label="Settings" onPress={() => navigation.navigate('Settings')} />
      ),
    });
  }, [navigation, desktop, status]);

  const sections = useMemo(() => {
    const inbox: Row[] = needsYouItems(asks.asks, sessions, panes).map((entry) =>
      entry.kind === 'ask' ? { kind: 'ask', ask: entry.ask } : { kind: 'inbox', item: entry.item },
    );
    const list: { key: string; title: string; data: Row[] }[] = [];
    if (inbox.length > 0) list.push({ key: 'inbox', title: 'Needs you', data: inbox });
    for (const group of homeSections(byAttention(sessions, workspaceRank(panes)))) {
      list.push({ key: `group:${group.title}`, title: group.title, data: group.sessions.map((session) => ({ kind: 'workspace', session })) });
    }
    return list;
  }, [sessions, panes, asks.asks]);

  const firstGroupKey = sections.find((section) => section.key !== 'inbox')?.key;

  if (loading) return <Loading />;

  const openPane = (paneId: string, title: string) => navigation.navigate('Terminal', { paneId, title });

  return (
    <SectionList
      sections={sections}
      keyExtractor={(row) =>
        row.kind === 'ask' ? `ask:${row.ask.askId}` : row.kind === 'inbox' ? `inbox:${row.item.pane.paneId}` : row.session.sessionId
      }
      ListHeaderComponent={
        <>
          <ConnectionBanner
            status={status}
            host={pairing?.gatewayHost ?? ''}
            desktop={desktop}
            onPairAgain={() => void onUnpair()}
          />
          {asks.unsupported ? (
            <Text style={[type.caption, styles.note]}>Update Ostia on the desktop to answer from here.</Text>
          ) : null}
        </>
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
            trailing={<Text style={[type.caption, styles.count]}>{section.data.length}</Text>}
          />
        ) : (
          <SectionHeader
            title={section.title}
            trailing={status !== 'connected' && section.key === firstGroupKey ? <LoadedAt at={loadedAt} /> : null}
          />
        )
      }
      ItemSeparatorComponent={({ leadingItem }) => (leadingItem?.kind === 'workspace' ? <Divider /> : null)}
      ListEmptyComponent={
        status === 'connected' ? (
          <Empty title="No workspaces" body="Open one in Ostia on your desktop." />
        ) : null
      }
      renderItem={({ item: row }) => {
        if (row.kind === 'ask') {
          const { ask } = row;
          return (
            <AskCard
              ask={ask}
              workspace={sessions.find((session) => session.sessionId === ask.sessionId)?.name ?? ''}
              canRespond={canRespond}
              pending={asks.pending[ask.askId]}
              error={asks.errors[ask.askId]}
              onAnswer={(answer) => void answerAsk(ask.askId, answer)}
            />
          );
        }
        if (row.kind === 'inbox') {
          const { pane, workspace, reason } = row.item;
          const title = paneTitle(pane);
          return (
            <View style={styles.card}>
              <Text style={styles.meta} numberOfLines={1}>
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
  titleRow: { flexDirection: 'row', alignItems: 'center' },
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
  note: { paddingHorizontal: 16, paddingTop: 12 },
});
