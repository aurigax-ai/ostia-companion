import React, { useLayoutEffect } from 'react';
import { RefreshControl, SectionList } from 'react-native';
import { FileText, Globe, PanelsTopLeft, SquareTerminal } from 'lucide-react-native';
import { ConnectionBanner, LoadedAt } from '../components/ConnectionBanner';
import { Divider, Empty, HeaderTitle, IconTile, ListRow, SectionHeader, StatusPill } from '../components/ui';
import { Pane, groupPanes, paneStatus, paneSubtitle, paneTitle, shortPath } from '../model/workspaces';
import { ScreenProps } from '../navigation';
import { OstiaRpc } from '../services/rpc';
import { refreshWorkspaces, useConnectionStatus, useWorkspaces } from '../services/workspaceStore';
import { colors } from '../theme';

export function WorkspaceScreen({ navigation, route }: ScreenProps<'Workspace'>) {
  const { sessions, panes, refreshing, loadedAt } = useWorkspaces();
  const status = useConnectionStatus();
  const pairing = OstiaRpc.getPairing();
  const workDir = sessions.find((session) => session.sessionId === route.params.sessionId)?.workDir;
  const groups = groupPanes(panes.filter((pane) => pane.sessionId === route.params.sessionId));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderTitle title={route.params.name || 'Workspace'} subtitle={shortPath(workDir)} mono />,
    });
  }, [navigation, route.params.name, workDir]);

  return (
    <SectionList
      sections={groups.map((group) => ({ title: group.title, data: group.panes }))}
      keyExtractor={(pane) => pane.paneId}
      ListHeaderComponent={
        <ConnectionBanner
          status={status}
          host={pairing?.gatewayHost ?? ''}
          desktop={pairing?.desktopName || 'the desktop'}
          onPairAgain={() => navigation.popToTop()}
        />
      }
      stickySectionHeadersEnabled={false}
      ItemSeparatorComponent={() => <Divider inset={72} />}
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
      renderSectionHeader={({ section }) => (
        <SectionHeader
          title={section.title}
          trailing={section.title === groups[0]?.title && status !== 'connected' ? <LoadedAt at={loadedAt} /> : null}
        />
      )}
      ListEmptyComponent={<Empty title="No panes" body="Nothing open in this workspace." />}
      renderItem={({ item: pane }) =>
        pane.kind === 'terminal' ? (
          <ListRow
            leading={<IconTile icon={SquareTerminal} tone="neutral" />}
            title={paneTitle(pane)}
            subtitle={paneSubtitle(pane, workDir)}
            mono
            trailing={<StatusPill status={paneStatus(pane)} />}
            onPress={() => navigation.navigate('Terminal', { paneId: pane.paneId, title: paneTitle(pane) })}
          />
        ) : (
          <ListRow
            leading={<IconTile icon={iconFor(pane)} tone="ghost" />}
            title={paneTitle(pane)}
            subtitle={kindLabel(pane)}
            mono
            disabled
          />
        )
      }
    />
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
