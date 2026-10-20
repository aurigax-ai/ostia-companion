import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Keyboard, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { Clock, Folder, FolderOpen, MonitorOff } from 'lucide-react-native';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { Divider, Empty, GroupItem, IconTile, ListRow, Meta, SearchField, SectionHeader, SnackbarHost, useTabBarInset, TILE_INSET, terminalIcon, NO_SCROLL_BARS } from '../components/ui';
import { matchRange, search, SearchHit, workspaceSections, WorkspaceRow } from '../model/workspaceList';
import { paneScreen, paneTitle, Session } from '../model/workspaces';
import { TabProps } from '../navigation';
import { useAsks } from '../services/askStore';
import { addRecentSearch, toggleSection, useListPrefs } from '../services/listPrefsStore';
import { OstiaRpc } from '../services/rpc';
import { refreshWorkspaces, useConnectionStatus, useWorkspaces } from '../services/workspaceStore';
import { useNow } from '../services/useNow';
import { colors, space } from '../theme';

type Row = { kind: 'workspace'; row: WorkspaceRow } | { kind: 'hit'; hit: SearchHit } | { kind: 'recent'; query: string };
type Section = { key: string; title: string | null; needs?: number; open?: boolean; folds?: boolean; data: Row[] };

export function WorkspacesScreen({ navigation }: TabProps<'Workspaces'>) {
  const { sessions, panes, seen, refreshing, loading } = useWorkspaces();
  const asks = useAsks();
  const status = useConnectionStatus();
  const prefs = useListPrefs();
  const now = useNow(60_000);
  const barInset = useTabBarInset();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const pairing = OstiaRpc.getPairing();
  const tabBar = searching ? 0 : barInset;

  useLayoutEffect(() => {
    navigation.setOptions({ tabBarStyle: { display: searching ? 'none' : 'flex' } });
  }, [navigation, searching]);

  const open = (session: Session) => {
    if (searching) addRecentSearch(query);
    navigation.navigate('Workspace', { sessionId: session.sessionId, name: session.name });
  };

  const sections: Section[] = useMemo(() => {
    if (searching) {
      if (!query.trim()) return prefs.recent.length > 0 ? [{ key: 'recent', title: 'Recent', data: prefs.recent.map((text) => ({ kind: 'recent' as const, query: text })) }] : [];
      const hits = search(query, sessions, panes, seen, now);
      const found = (kind: SearchHit['kind']) => hits.filter((hit) => hit.kind === kind).map((hit) => ({ kind: 'hit' as const, hit }));
      return [
        { key: 'hit-workspaces', title: 'Workspaces', data: found('workspace') },
        { key: 'hit-sessions', title: 'Sessions', data: found('pane') },
      ].filter((section) => section.data.length > 0);
    }
    return workspaceSections(sessions, panes, asks.asks, seen, now, prefs.unfolded).map((section) => ({
      key: section.key,
      title: section.title,
      needs: section.needs,
      open: section.open,
      folds: section.folds,
      data: section.open ? section.rows.map((row) => ({ kind: 'workspace' as const, row })) : [],
    }));
  }, [searching, query, sessions, panes, seen, now, asks.asks, prefs]);

  const names = new Map(sessions.map((session) => [session.sessionId, session]));

  return (
    <View style={styles.fill}>
      <SectionList {...NO_SCROLL_BARS}
        sections={sections}
        keyExtractor={(row) => (row.kind === 'workspace' ? row.row.session.sessionId : row.kind === 'recent' ? `recent:${row.query}` : row.hit.kind === 'workspace' ? `w:${row.hit.session.sessionId}` : `p:${row.hit.pane.paneId}`)}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: tabBar + space.xxxl + space.xxl }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <ConnectionBanner status={status} host={pairing?.gatewayHost ?? ''} desktop={pairing?.desktopName || 'the desktop'} onPairAgain={() => navigation.navigate('Desktops')} />
            <View style={styles.search}>
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder="Search workspaces and sessions"
                onFocus={() => setSearching(true)}
                onClear={searching ? () => (setSearching(false), Keyboard.dismiss()) : undefined}
              />
            </View>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refreshWorkspaces(true)} colors={[colors.brand]} progressBackgroundColor={colors.surface} tintColor={colors.brand} />
        }
        renderSectionHeader={({ section }) =>
          section.title === null ? null : (
            <SectionHeader
              title={section.title}
              open={section.open}
              onToggle={section.folds ? () => toggleSection(section.key) : undefined}
              trailing={section.needs ? <Meta text={`${section.needs} need you`} tone="attn" /> : null}
            />
          )
        }
        ItemSeparatorComponent={() => <Divider inset={TILE_INSET} />}
        renderItem={({ item, index, section }) => (
          <GroupItem first={index === 0} last={index === section.data.length - 1}>
            {item.kind === 'workspace' ? (
              <ListRow
                leading={<IconTile icon={Folder} dot={item.row.attention} />}
                title={item.row.session.name}
                subtitle={item.row.summary}
                trailing={item.row.needs > 0 ? <Meta text={String(item.row.needs)} tone="attn" /> : null}
                chevron={false}
                onPress={() => open(item.row.session)}
              />
            ) : item.kind === 'recent' ? (
              <ListRow leading={<IconTile icon={Clock} tone="ghost" />} title={item.query} chevron={false} onPress={() => setQuery(item.query)} />
            ) : item.hit.kind === 'workspace' ? (
              <ListRow
                leading={<IconTile icon={FolderOpen} />}
                title={item.hit.session.name}
                mark={matchRange(item.hit.session.name, query)}
                subtitle={item.hit.summary}
                chevron={false}
                onPress={() => open((item.hit as { session: Session }).session)}
              />
            ) : (
              <ListRow
                leading={<IconTile icon={terminalIcon(item.hit.pane)} />}
                title={item.hit.workspace}
                mark={matchRange(item.hit.workspace, query)}
                subtitle={[paneTitle(item.hit.pane), item.hit.line].filter(Boolean).join(' · ')}
                chevron={false}
                onPress={() => {
                  const hit = item.hit as Extract<SearchHit, { kind: 'pane' }>;
                  addRecentSearch(query);
                  if (names.has(hit.pane.sessionId)) navigation.navigate(paneScreen(hit.pane), { paneId: hit.pane.paneId, title: paneTitle(hit.pane) });
                }}
              />
            )}
          </GroupItem>
        )}
        ListEmptyComponent={
          searching ? null : loading ? null : <Empty icon={MonitorOff} title="No workspaces" body="Workspaces open on the desktop show here." />
        }
      />
      <SnackbarHost bottom={tabBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingTop: space.sm, paddingBottom: space.md },
  search: { paddingTop: space.md },
  content: { paddingBottom: space.xxl, flexGrow: 1 },
});
