import React from 'react';
import { FlatList, RefreshControl, Text } from 'react-native';
import { BellRing, Globe, SquareTerminal, FileText, PanelsTopLeft } from 'lucide-react-native';
import { Avatar, Divider, Empty, ListRow } from '../components/ui';
import { Pane, failedExit, paneSubtitle, paneTitle } from '../model/workspaces';
import { ScreenProps } from '../navigation';
import { refreshWorkspaces, useWorkspaces } from '../services/workspaceStore';
import { colors, type } from '../theme';

export function WorkspaceScreen({ navigation, route }: ScreenProps<'Workspace'>) {
  const { sessions, panes, refreshing } = useWorkspaces();
  const workDir = sessions.find((session) => session.sessionId === route.params.sessionId)?.workDir;
  const sessionPanes = panes.filter((pane) => pane.sessionId === route.params.sessionId);

  return (
    <FlatList
      data={sessionPanes}
      keyExtractor={(pane) => pane.paneId}
      ItemSeparatorComponent={() => <Divider />}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 32, flexGrow: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refreshWorkspaces(true)}
          colors={[colors.brand]}
          progressBackgroundColor={colors.surface}
          tintColor={colors.brand}
        />
      }
      ListEmptyComponent={<Empty title="No panes" body="This workspace has no open panes on the desktop." />}
      renderItem={({ item: pane }) => {
        const terminal = pane.kind === 'terminal';
        return (
          <ListRow
            leading={<Avatar icon={iconFor(pane)} tone={toneFor(pane)} />}
            title={paneTitle(pane)}
            subtitle={paneSubtitle(pane, workDir)}
            trailing={<PaneStatus pane={pane} />}
            onPress={
              terminal
                ? () => navigation.navigate('Terminal', { paneId: pane.paneId, title: paneTitle(pane) })
                : undefined
            }
          />
        );
      }}
    />
  );
}

function PaneStatus({ pane }: { pane: Pane }) {
  const exit = failedExit(pane);
  if (pane.agentState === 'waiting') return <Text style={[type.caption, { color: colors.attnFg }]}>Needs you</Text>;
  if (pane.running) return <Text style={[type.caption, { color: colors.brand }]}>Running</Text>;
  if (exit !== null) return <Text style={[type.caption, { color: colors.attnFg }]}>Exit {exit}</Text>;
  return null;
}

function iconFor(pane: Pane) {
  if (pane.agentState === 'waiting') return BellRing;
  if (pane.kind === 'terminal') return SquareTerminal;
  if (pane.kind === 'browser') return Globe;
  if (pane.kind === 'editor') return FileText;
  return PanelsTopLeft;
}

function toneFor(pane: Pane): 'neutral' | 'brand' | 'attn' {
  if (pane.agentState === 'waiting' || failedExit(pane) !== null) return 'attn';
  if (pane.running) return 'brand';
  return 'neutral';
}
