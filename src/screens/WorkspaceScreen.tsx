import React, { useLayoutEffect, useState } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { FileText, FolderOpen, Globe, PanelsTopLeft } from 'lucide-react-native';
import { AskCard } from '../components/AskCard';
import { AskSheet } from '../components/AskSheet';
import { ConnectionBanner, LoadedAt } from '../components/ConnectionBanner';
import { Divider, Empty, GroupItem, HeaderTitle, IconTile, ListRow, SectionHeader, StatusPill, TILE_INSET, terminalIcon } from '../components/ui';
import { Ask } from '../model/asks';
import { attentionRank, byAttention } from '../model/order';
import { Pane, groupPanes, paneStatus, paneSubtitle, paneTitle, shortPath } from '../model/workspaces';
import { ScreenProps } from '../navigation';
import { answerAsk, useAsks } from '../services/askStore';
import { OstiaRpc } from '../services/rpc';
import { refreshWorkspaces, useCaps, useConnectionStatus, useWorkspaces } from '../services/workspaceStore';
import { colors, space } from '../theme';

type Row = { kind: 'ask'; ask: Ask } | { kind: 'files' } | { kind: 'pane'; pane: Pane };
type Section = { key: string; title: string; data: Row[] };

export function WorkspaceScreen({ navigation, route }: ScreenProps<'Workspace'>) {
  const { sessionId, name } = route.params;
  const { sessions, panes, refreshing, loadedAt } = useWorkspaces();
  const status = useConnectionStatus();
  const asks = useAsks();
  const canRespond = useCaps().includes('respond');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const pairing = OstiaRpc.getPairing();
  const workDir = sessions.find((session) => session.sessionId === sessionId)?.workDir;
  const groups = groupPanes(panes.filter((pane) => pane.sessionId === sessionId));
  const terminals = groups.find((group) => group.title === 'Terminals')?.panes ?? [];
  const desktopOnly = groups.find((group) => group.title === 'Desktop only')?.panes ?? [];
  const ownAsks = [...asks.asks].filter((ask) => ask.sessionId === sessionId).sort((a, b) => a.since - b.since);
  const sheetAsk = ownAsks.find((ask) => ask.askId === replyTo) ?? null;

  const sections: Section[] = [
    ...(ownAsks.length > 0 ? [{ key: 'asks', title: 'Needs you', data: ownAsks.map((ask) => ({ kind: 'ask' as const, ask })) }] : []),
    ...(terminals.length > 0
      ? [{ key: 'terminals', title: 'Terminals', data: byAttention(terminals, attentionRank).map((pane) => ({ kind: 'pane' as const, pane })) }]
      : []),
    { key: 'more', title: 'More', data: [{ kind: 'files' as const }, ...desktopOnly.map((pane) => ({ kind: 'pane' as const, pane }))] },
  ];
  const firstListKey = sections.find((section) => section.key !== 'asks')?.key;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderTitle title={name || 'Workspace'} subtitle={shortPath(workDir)} mono />,
    });
  }, [navigation, name, workDir]);

  return (
    <>
      <SectionList
        sections={sections}
        keyExtractor={(row) => (row.kind === 'ask' ? `ask:${row.ask.askId}` : row.kind === 'files' ? 'files' : row.pane.paneId)}
        ListHeaderComponent={
          <ConnectionBanner
            status={status}
            host={pairing?.gatewayHost ?? ''}
            desktop={pairing?.desktopName || 'the desktop'}
            onPairAgain={() => navigation.popToTop()}
          />
        }
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={({ leadingItem }) =>
          leadingItem?.kind === 'ask' ? <View style={{ height: space.sm }} /> : <Divider inset={TILE_INSET} />
        }
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: space.xxl, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshWorkspaces(true)}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surface}
            tintColor={colors.brand}
          />
        }
        renderSectionHeader={({ section }) => (
          <SectionHeader
            title={section.title}
            trailing={section.key === firstListKey && status !== 'connected' ? <LoadedAt at={loadedAt} /> : null}
          />
        )}
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
              {row.kind === 'files' ? (
                <ListRow
                  leading={<IconTile icon={FolderOpen} />}
                  title="Files"
                  subtitle={shortPath(workDir)}
                  mono
                  onPress={() => navigation.navigate('Files', { sessionId, path: '', title: name || 'Files' })}
                />
              ) : row.pane.kind === 'terminal' ? (
                <ListRow
                  leading={<IconTile icon={terminalIcon(row.pane)} tone={paneStatus(row.pane).tone === 'attn' ? 'attn' : 'neutral'} />}
                  title={paneTitle(row.pane)}
                  subtitle={paneSubtitle(row.pane, workDir)}
                  mono
                  trailing={<StatusPill status={paneStatus(row.pane)} />}
                  onPress={() => navigation.navigate('Terminal', { paneId: row.pane.paneId, title: paneTitle(row.pane) })}
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
          terminals.length === 0 && desktopOnly.length === 0 ? (
            <Empty icon={PanelsTopLeft} title="No panes" body="Nothing open in this workspace." />
          ) : null
        }
      />
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
    </>
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
