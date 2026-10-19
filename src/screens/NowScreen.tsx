import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Platform, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { MessagesSquare, SquarePen } from 'lucide-react-native';
import { AskSheet } from '../components/AskSheet';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { Button, Empty, Fab, Warning, GroupItem, HeaderTitle, IconButton, IconTile, ListRow, Meta, SectionHeader, SnackbarHost, useTabBarInset, TILE_INSET, Divider, terminalIcon } from '../components/ui';
import { ago, NowRow, nowSections, quietLine } from '../model/now';
import { paneTitle } from '../model/workspaces';
import { TabProps } from '../navigation';
import { answerAsk, useAsks } from '../services/askStore';
import { OstiaRpc } from '../services/rpc';
import { refreshWorkspaces, useCaps, useConnectionStatus, useWorkspaces } from '../services/workspaceStore';
import { useNow } from '../services/useNow';
import { colors, space } from '../theme';

type Section = { key: string; title: string; count?: number; data: NowRow[] };

function rowLine(row: NowRow): string {
  if (row.kind === 'ask') return `${row.ask.agent ?? 'agent'} · ${row.ask.title}`;
  const agent = row.pane.agent && row.pane.agent !== 'other' ? row.pane.agent : paneTitle(row.pane);
  const line = row.pane.agentMessage || (row.pane.agentState === 'working' ? 'Working' : row.pane.agentState === 'error' ? 'Failed' : '');
  return line ? `${agent} · ${line}` : agent;
}

export function NowScreen({ navigation }: TabProps<'Chats'>) {
  const { sessions, panes, seen, refreshing } = useWorkspaces();
  const asks = useAsks();
  const status = useConnectionStatus();
  const canRespond = useCaps().includes('respond');
  const now = useNow(60_000);
  const tabBar = useTabBarInset();
  const [unfolded, setUnfolded] = useState(false);
  const [askId, setAskId] = useState<string | null>(null);
  const pairing = OstiaRpc.getPairing();
  const lists = useMemo(() => nowSections(asks.asks, sessions, panes, seen, now), [asks.asks, sessions, panes, seen, now]);
  const sheetAsk = asks.asks.find((ask) => ask.askId === askId) ?? null;
  const newChat = () => navigation.navigate('NewChat');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderTitle title="Chats" subtitle={lists.count > 0 ? `${lists.count} need you` : undefined} attention />,
      headerRight: Platform.OS === 'ios' ? () => <IconButton icon={SquarePen} label="New chat" onPress={newChat} /> : undefined,
      tabBarBadge: lists.count > 0 ? lists.count : undefined,
    });
  }, [navigation, lists.count]);

  const sections: Section[] = [
    { key: 'needs', title: 'Needs you', count: lists.needsYou.length, data: lists.needsYou },
    { key: 'working', title: 'Working', count: lists.working.length, data: lists.working },
    { key: 'done', title: 'Done today', count: lists.doneToday.length, data: lists.doneToday },
    { key: 'rest', title: '', data: unfolded ? lists.idle : [] },
  ].filter((section) => section.data.length > 0 || (section.key === 'rest' && lists.idle.length + lists.hibernated > 0));
  const quiet = lists.idle.length + lists.hibernated > 0;

  return (
    <View style={styles.fill}>
      <SectionList
        sections={sections}
        keyExtractor={(row) => (row.kind === 'ask' ? `ask:${row.ask.askId}` : row.pane.paneId)}
        stickySectionHeadersEnabled={false}
        initialNumToRender={30}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: tabBar + space.xxxl + space.xxl }]}
        ListHeaderComponent={
          <>
            <ConnectionBanner status={status} host={pairing?.gatewayHost ?? ''} desktop={pairing?.desktopName || 'the desktop'} onPairAgain={() => navigation.navigate('Desktops')} />
            {asks.unsupported ? <Warning text="Update Ostia on the desktop to answer from here." /> : null}
          </>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refreshWorkspaces(true)} colors={[colors.brand]} progressBackgroundColor={colors.surface} tintColor={colors.brand} />
        }
        renderSectionHeader={({ section }) =>
          section.key === 'rest' ? (
            quiet ? (
              <SectionHeader
                title={quietLine(lists.idle.length, lists.hibernated)}
                trailing={lists.idle.length > 0 ? <Button label={unfolded ? 'Hide' : 'Show'} variant="text" compact onPress={() => setUnfolded(!unfolded)} /> : null}
              />
            ) : null
          ) : (
            <SectionHeader title={section.title} trailing={<Meta text={String(section.count)} tone={section.key === 'needs' ? 'attn' : 'muted'} />} />
          )
        }
        ItemSeparatorComponent={() => <Divider inset={TILE_INSET} />}
        renderItem={({ item: row, index, section }) => {
          const needs = section.key === 'needs';
          return (
            <GroupItem first={index === 0} last={index === section.data.length - 1}>
              <ListRow
                leading={<IconTile icon={row.kind === 'ask' ? MessagesSquare : terminalIcon(row.pane)} tone={needs ? 'attn' : 'neutral'} />}
                title={row.workspace || 'Workspace'}
                subtitle={rowLine(row)}
                attention={needs}
                trailing={<Meta text={ago(row.at, now)} />}
                chevron={false}
                onPress={() =>
                  row.kind === 'ask' ? setAskId(row.ask.askId) : navigation.navigate('Terminal', { paneId: row.pane.paneId, title: paneTitle(row.pane) })
                }
              />
            </GroupItem>
          );
        }}
        ListEmptyComponent={<Empty icon={MessagesSquare} title="Nothing going on" body="Agents that need you, are working or finished today show here." />}
      />
      {Platform.OS === 'android' ? <Fab label="New chat" icon={SquarePen} onPress={newChat} bottom={tabBar} /> : null}
      <SnackbarHost bottom={tabBar} />
      <AskSheet
        ask={sheetAsk}
        workspace={sessions.find((session) => session.sessionId === sheetAsk?.sessionId)?.name ?? ''}
        canRespond={canRespond}
        pending={sheetAsk ? asks.pending[sheetAsk.askId] : undefined}
        error={sheetAsk ? asks.errors[sheetAsk.askId] : undefined}
        onAnswer={(answer) => {
          if (!sheetAsk) return;
          setAskId(null);
          void answerAsk(sheetAsk.askId, answer);
        }}
        onClose={() => setAskId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: space.xxxl + space.xxl, flexGrow: 1 },
});
