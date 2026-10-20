import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Platform, RefreshControl, SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileText, FolderOpen, Globe, PanelsTopLeft, Plus, Sparkles } from 'lucide-react-native';
import { AskCard } from '../components/AskCard';
import { AskSheet } from '../components/AskSheet';
import { ConnectionBanner, LoadedAt } from '../components/ConnectionBanner';
import { Badge, Divider, Empty, Fab, GroupItem, HeaderTitle, IconTile, ListRow, Meta, SectionHeader, SnackbarHost, StatusPill, TILE_INSET, terminalIcon, NO_SCROLL_BARS } from '../components/ui';
import { Ask } from '../model/asks';
import { attentionRank, byAttention } from '../model/order';
import { paneSections } from '../model/workspaceList';
import { Pane, groupPanes, paneScreen, paneStatus, paneSubtitle, paneTitle, shortPath } from '../model/workspaces';
import { ScreenProps } from '../navigation';
import { useArtifacts } from '../services/artifactStore';
import { answerAsk, useAsks } from '../services/askStore';
import { toggleSection, useListPrefs } from '../services/listPrefsStore';
import { OstiaRpc } from '../services/rpc';
import { refreshWorkspaces, useCaps, useConnectionStatus, useWorkspaces } from '../services/workspaceStore';
import { colors, space } from '../theme';

type Row = { kind: 'ask'; ask: Ask } | { kind: 'artifacts' } | { kind: 'files' } | { kind: 'new' } | { kind: 'pane'; pane: Pane } | { kind: 'sleeping'; pane: Pane };
type Section = { key: string; title: string; count?: number; folds?: boolean; open?: boolean; data: Row[] };

export function WorkspaceScreen({ navigation, route }: ScreenProps<'Workspace'>) {
  const { sessionId, name, askId } = route.params;
  const insets = useSafeAreaInsets();
  const { sessions, panes, seen, refreshing, loadedAt } = useWorkspaces();
  const folds = useListPrefs().unfolded;
  const status = useConnectionStatus();
  const asks = useAsks();
  const unreadArtifacts = useArtifacts().unread[sessionId]?.length ?? 0;
  const canRespond = useCaps().includes('respond');
  const [replyTo, setReplyTo] = useState<string | null>(askId ?? null);
  useEffect(() => {
    if (askId) setReplyTo(askId);
  }, [askId]);
  const pairing = OstiaRpc.getPairing();
  const workDir = sessions.find((session) => session.sessionId === sessionId)?.workDir;
  const own = panes.filter((pane) => pane.sessionId === sessionId);
  const groups = groupPanes(own);
  const split = paneSections(own, seen);
  const sleepKey = `hibernated:${sessionId}`;
  const sleepOpen = folds.includes(sleepKey);
  const desktopOnly = groups.find((group) => group.title === 'Desktop only')?.panes ?? [];
  const ownAsks = [...asks.asks].filter((ask) => ask.sessionId === sessionId).sort((a, b) => a.since - b.since);
  const sheetAsk = ownAsks.find((ask) => ask.askId === replyTo) ?? null;

  const sections: Section[] = [
    ...(ownAsks.length > 0 ? [{ key: 'asks', title: 'Needs you', data: ownAsks.map((ask) => ({ kind: 'ask' as const, ask })) }] : []),
    ...(split.active.length > 0 ? [{ key: 'active', title: 'Active', count: split.active.length, data: byAttention(split.active, attentionRank).map((pane) => ({ kind: 'pane' as const, pane })) }] : []),
    ...(split.idle.length > 0 ? [{ key: 'idle', title: 'Idle', count: split.idle.length, data: split.idle.map((pane) => ({ kind: 'pane' as const, pane })) }] : []),
    ...(split.hibernated.length > 0
      ? [{ key: 'hibernated', title: 'Hibernated', count: split.hibernated.length, folds: true, open: sleepOpen, data: sleepOpen ? split.hibernated.map((pane) => ({ kind: 'sleeping' as const, pane })) : [] }]
      : []),
    ...(Platform.OS === 'ios' ? [{ key: 'new', title: '', data: [{ kind: 'new' as const }] }] : []),
    { key: 'more', title: 'More', data: [{ kind: 'artifacts' as const }, { kind: 'files' as const }, ...desktopOnly.map((pane) => ({ kind: 'pane' as const, pane }))] },
  ];
  const newSession = () => navigation.navigate('NewChat', { sessionId });
  const firstListKey = sections.find((section) => section.key !== 'asks')?.key;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderTitle title={name || 'Workspace'} subtitle={shortPath(workDir)} mono />,
    });
  }, [navigation, name, workDir]);

  return (
    <View style={{ flex: 1 }}>
      <SectionList {...NO_SCROLL_BARS}
        sections={sections}
        keyExtractor={(row) => (row.kind === 'ask' ? `ask:${row.ask.askId}` : row.kind === 'pane' || row.kind === 'sleeping' ? row.pane.paneId : row.kind)}
        ListHeaderComponent={
          <ConnectionBanner
            status={status}
            host={pairing?.gatewayHost ?? ''}
            desktop={pairing?.desktopName || 'the desktop'}
            onPairAgain={() => navigation.popToTop()}
          />
        }
        stickySectionHeadersEnabled={false}
        initialNumToRender={30}
        ItemSeparatorComponent={({ leadingItem }) =>
          leadingItem?.kind === 'ask' ? <View style={{ height: space.sm }} /> : <Divider inset={TILE_INSET} />
        }
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: space.xxxl + space.xxl, flexGrow: 1 }}
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
          section.title ? (
            <SectionHeader
              title={section.title}
              open={section.open}
              onToggle={section.folds ? () => toggleSection(sleepKey) : undefined}
              trailing={
                section.key === firstListKey && status !== 'connected' ? (
                  <LoadedAt at={loadedAt} />
                ) : section.key === 'hibernated' ? (
                  <Meta text="wake from the desktop" />
                ) : section.count ? (
                  <Meta text={String(section.count)} />
                ) : null
              }
            />
          ) : (
            <View style={{ height: space.xl }} />
          )
        }
        renderItem={({ item: row, index, section }) => {
          if (row.kind === 'ask') {
            return (
                <AskCard
                  ask={row.ask}
                  workspace=""
                  canRespond={canRespond}
                  pending={asks.pending[row.ask.askId]}
                  error={asks.errors[row.ask.askId]}
                  onAnswer={(answer) => void answerAsk(row.ask.askId, answer)}
                  onReply={() => setReplyTo(row.ask.askId)}
                  compact
                />
            );
          }
          return (
            <GroupItem first={index === 0} last={index === section.data.length - 1}>
              {row.kind === 'artifacts' ? (
                <ListRow
                  leading={<IconTile icon={Sparkles} />}
                  title="Artifacts"
                  subtitle="What the agents made for you, and the Scratch Pad"
                  trailing={unreadArtifacts > 0 ? <Badge text={String(unreadArtifacts)} tone="brand" /> : null}
                  onPress={() => navigation.navigate('Artifacts', { sessionId, path: '', title: name || 'Workspace' })}
                />
              ) : row.kind === 'files' ? (
                <ListRow
                  leading={<IconTile icon={FolderOpen} />}
                  title="Files"
                  subtitle={shortPath(workDir)}
                  mono
                  onPress={() => navigation.navigate('Files', { sessionId, path: '', title: name || 'Files' })}
                />
              ) : row.kind === 'new' ? (
                <ListRow leading={<IconTile icon={Plus} tone="brand" />} title="New agent session" onPress={newSession} />
              ) : row.kind === 'sleeping' ? (
                <ListRow
                  leading={<IconTile icon={terminalIcon(row.pane)} tone="ghost" />}
                  title={paneTitle(row.pane)}
                  subtitle={paneSubtitle(row.pane, workDir)}
                  mono
                  disabled
                />
              ) : row.pane.kind === 'terminal' ? (
                <ListRow
                  leading={<IconTile icon={terminalIcon(row.pane)} tone={paneStatus(row.pane).tone === 'attn' ? 'attn' : 'neutral'} />}
                  title={paneTitle(row.pane)}
                  subtitle={paneSubtitle(row.pane, workDir)}
                  mono
                  trailing={<StatusPill status={paneStatus(row.pane)} />}
                  onPress={() => navigation.navigate(paneScreen(row.pane), { paneId: row.pane.paneId, title: paneTitle(row.pane) })}
                />
              ) : (
                <ListRow
                  leading={<IconTile icon={iconFor(row.pane)} tone="ghost" />}
                  title={paneTitle(row.pane)}
                  subtitle={`${kindLabel(row.pane)} · desktop only`}
                  mono
                  disabled
                />
              )}
            </GroupItem>
          );
        }}
        ListFooterComponent={
          own.length === 0 ? (
            <Empty icon={PanelsTopLeft} title="No panes" body="Nothing open in this workspace." />
          ) : null
        }
      />
      {Platform.OS === 'android' ? <Fab label="New session" icon={Plus} onPress={newSession} bottom={insets.bottom} /> : null}
      <SnackbarHost />
      <AskSheet
        ask={sheetAsk}
        workspace={name}
        canRespond={canRespond}
        pending={sheetAsk ? asks.pending[sheetAsk.askId] : undefined}
        error={sheetAsk ? asks.errors[sheetAsk.askId] : undefined}
        onAnswer={(answer) => {
          if (!sheetAsk) return;
          setReplyTo(null);
          void answerAsk(sheetAsk.askId, answer);
        }}
        onClose={() => setReplyTo(null)}
      />
    </View>
  );
}

function iconFor(pane: Pane) {
  if (pane.kind === 'browser') return Globe;
  if (pane.kind === 'editor') return FileText;
  return PanelsTopLeft;
}

function kindLabel(pane: Pane) {
  return pane.kind.charAt(0).toUpperCase() + pane.kind.slice(1);
}
