import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { MotiView } from 'moti';
import {
  AlertTriangle,
  ChevronRight,
  Columns,
  Folder,
  LayoutGrid,
  Power,
  RefreshCw,
  Terminal,
  User,
  Wifi,
} from 'lucide-react-native';
import { OstiaRpc } from '../services/rpc';
import { clearPairingData, getPairingData } from '../services/storage';
import { Button, EmptyState, IconButton, Pill, Screen, cn, colors } from '../components/ui';

interface DashboardScreenProps {
  onSelectPane: (paneId: string, title: string) => void;
  onUnpair: () => void;
}

interface Session {
  id: string;
  name: string;
  kind: string;
  workDir: string;
  state: string;
}

interface Pane {
  paneId: string;
  sessionId: string;
  kind: string;
  title: string;
  cwd?: string;
  running: boolean;
  blockCount: number;
  lastExitCode?: number;
  agentWaiting?: boolean;
}

interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  status: string;
  assignee?: string;
}

interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
}

type Tab = 'workspace' | 'board';

export function DashboardScreen({ onSelectPane, onUnpair }: DashboardScreenProps) {
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<Tab>('workspace');
  const [desktopName, setDesktopName] = useState('Ostia Workspace');
  const [connStatus, setConnStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>(OstiaRpc.getStatus());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [panes, setPanes] = useState<Pane[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boardColumns, setBoardColumns] = useState<KanbanColumn[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);

  const waitingCount = panes.filter((pane) => pane.agentWaiting).length;
  const runningCount = panes.filter((pane) => pane.running).length;
  const boardColumnWidth = Math.min(Math.max(width - 40, 286), 380);

  const statusTone = useMemo(() => {
    if (connStatus === 'connected') return 'success';
    if (connStatus === 'connecting') return 'warning';
    return 'danger';
  }, [connStatus]);

  useEffect(() => {
    getPairingData().then((data) => {
      if (data) setDesktopName(data.desktopName || 'Ostia Desktop');
    });

    const unsubscribeStatus = OstiaRpc.addStatusListener((status) => {
      setConnStatus(status);
      if (status === 'connected') {
        fetchWorkspaceData();
      }
    });

    const unsubscribeEvents = OstiaRpc.addEventListener((type, payload) => {
      if (type === 'pane.state') {
        updatePaneState(payload);
      } else if (type === 'session.state') {
        updateSessionState(payload);
      } else if (type === 'agent.needs-input') {
        setPaneAgentWaiting(payload.paneId, true);
      } else if (type === 'agent.done') {
        setPaneAgentWaiting(payload.paneId, false);
      } else if (type === 'board.changed') {
        fetchKanbanBoard();
      }
    });

    if (OstiaRpc.getStatus() === 'connected') {
      fetchWorkspaceData();
    } else {
      setLoading(false);
    }

    return () => {
      unsubscribeStatus();
      unsubscribeEvents();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'board' && connStatus === 'connected') {
      fetchKanbanBoard();
    }
  }, [activeTab, connStatus]);

  const fetchWorkspaceData = async () => {
    setLoading(true);
    setError(null);
    try {
      const sessionResult = await OstiaRpc.call('session.list');
      const paneResult = await OstiaRpc.call('pane.list');
      setSessions(sessionResult.sessions || []);
      setPanes(paneResult.panes || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch sessions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchKanbanBoard = async () => {
    setLoadingBoard(true);
    try {
      const board = await OstiaRpc.call('board.get');
      if (board?.columns) {
        const columnsData: KanbanColumn[] = board.columns.map((col: any) => {
          const colId = typeof col === 'string' ? col : col.id;
          const colTitle = typeof col === 'string' ? col.toUpperCase() : col.title;
          const colCards = (board.cards || []).filter((card: any) => card.status === colId);
          return {
            id: colId,
            title: colTitle,
            cards: colCards,
          };
        });
        setBoardColumns(columnsData);
      }
    } catch (err) {
      console.warn('Kanban Board API not supported/implemented on desktop yet:', err);
    } finally {
      setLoadingBoard(false);
    }
  };

  const updatePaneState = (updatedPane: any) => {
    setPanes((prevPanes) => {
      const idx = prevPanes.findIndex((pane) => pane.paneId === updatedPane.paneId);
      if (idx > -1) {
        const copy = [...prevPanes];
        copy[idx] = { ...copy[idx], ...updatedPane };
        return copy;
      }
      return [...prevPanes, updatedPane];
    });
  };

  const updateSessionState = (updatedSession: any) => {
    setSessions((prevSessions) => {
      const idx = prevSessions.findIndex((session) => session.id === updatedSession.id);
      if (idx > -1) {
        const copy = [...prevSessions];
        copy[idx] = { ...copy[idx], ...updatedSession };
        return copy;
      }
      return [...prevSessions, updatedSession];
    });
  };

  const setPaneAgentWaiting = (paneId: string, waiting: boolean) => {
    setPanes((prevPanes) =>
      prevPanes.map((pane) => (pane.paneId === paneId ? { ...pane, agentWaiting: waiting } : pane))
    );
  };

  const handleRefresh = () => {
    setRefreshing(true);
    if (activeTab === 'board') {
      fetchKanbanBoard().finally(() => setRefreshing(false));
    } else {
      fetchWorkspaceData();
    }
  };

  const handleUnpair = async () => {
    OstiaRpc.disconnect();
    await clearPairingData();
    onUnpair();
  };

  return (
    <Screen>
      <View className="border-b border-ostia-border bg-ostia-bg px-4 pb-3">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-ostia-muted text-xs font-bold uppercase">Ostia</Text>
            <Text className="text-ostia-text text-2xl font-bold mt-1" numberOfLines={1}>
              {desktopName}
            </Text>
            <View className="flex-row items-center mt-2">
              <MotiView
                animate={{
                  opacity: connStatus === 'connecting' ? [0.45, 1, 0.45] : 1,
                  scale: connStatus === 'connecting' ? [0.9, 1.18, 0.9] : 1,
                }}
                transition={{
                  loop: connStatus === 'connecting',
                  duration: 1400,
                  type: 'timing',
                }}
                className={cn(
                  'h-2.5 w-2.5 rounded-full mr-2',
                  connStatus === 'connected'
                    ? 'bg-emerald-400'
                    : connStatus === 'connecting'
                      ? 'bg-amber-400'
                      : 'bg-red-400'
                )}
              />
              <Pill label={connStatus} tone={statusTone} />
            </View>
          </View>

          <View className="flex-row">
            <IconButton label="Refresh workspace" icon={RefreshCw} onPress={handleRefresh} className="mr-2" />
            <IconButton label="Disconnect device" icon={Power} danger onPress={handleUnpair} />
          </View>
        </View>

        <View className="flex-row mt-4">
          <Metric label="Sessions" value={sessions.length.toString()} />
          <Metric label="Panes" value={panes.length.toString()} />
          <Metric label="Running" value={runningCount.toString()} />
          <Metric label="Waiting" value={waitingCount.toString()} urgent={waitingCount > 0} />
        </View>

        <View className="flex-row bg-ostia-card border border-ostia-border rounded-lg p-1 mt-4">
          <TabButton
            active={activeTab === 'workspace'}
            icon={LayoutGrid}
            label="Workspace"
            onPress={() => setActiveTab('workspace')}
          />
          <TabButton
            active={activeTab === 'board'}
            icon={Columns}
            label="Board"
            onPress={() => setActiveTab('board')}
          />
        </View>
      </View>

      {connStatus !== 'connected' ? (
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          style={{
            backgroundColor: 'rgba(251, 191, 36, 0.08)',
            borderColor: 'rgba(251, 191, 36, 0.25)',
          }}
          className="mx-4 mt-4 p-3 rounded-lg border flex-row items-center animate-pulse"
        >
          <AlertTriangle size={16} color="#fbbf24" />
          <Text style={{ color: '#fde68a' }} className="text-xs font-semibold ml-2 flex-1 leading-4">
            Connecting to the desktop gateway. Keep Ostia open on the same LAN or tailnet.
          </Text>
        </MotiView>
      ) : null}

      {loading ? (
        <View className="flex-1 justify-center items-center p-8">
          <ActivityIndicator size="large" color={colors.accent} />
          <Text className="text-ostia-muted text-sm mt-3">Loading workspace</Text>
        </View>
      ) : activeTab === 'workspace' ? (
        renderWorkspace()
      ) : (
        renderKanban()
      )}
    </Screen>
  );

  function renderWorkspace() {
    if (error) {
      return (
        <EmptyState
          icon={AlertTriangle}
          title="Workspace unavailable"
          body={error}
          action={<Button label="Retry" icon={RefreshCw} onPress={fetchWorkspaceData} />}
        />
      );
    }

    if (sessions.length === 0) {
      return (
        <EmptyState
          icon={Folder}
          title="No active sessions"
          body="Create or attach a workspace in Ostia desktop, then pull to refresh here."
        />
      );
    }

    return (
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            tintColor={colors.accent}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >
        {sessions.map((session, index) => {
          const sessionPanes = panes.filter((pane) => pane.sessionId === session.id);
          return (
            <MotiView
              key={session.id}
              from={{ opacity: 0, translateY: 12 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'spring', delay: index * 60 }}
              className="bg-ostia-card rounded-lg border border-ostia-border mb-4 overflow-hidden"
            >
              <View className="px-4 py-4 border-b border-ostia-border/70">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-ostia-text text-base font-bold" numberOfLines={1}>
                      {session.name || 'Untitled session'}
                    </Text>
                    <Text className="text-ostia-muted text-xs font-mono mt-1" numberOfLines={1}>
                      {session.workDir || 'No working directory'}
                    </Text>
                  </View>
                  <Pill label={session.state.toLowerCase()} tone="accent" />
                </View>
              </View>

              {sessionPanes.length === 0 ? (
                <Text className="text-ostia-muted text-sm italic px-4 py-4">No open panes.</Text>
              ) : (
                sessionPanes.map((pane) => (
                  <PaneRow key={pane.paneId} pane={pane} onPress={() => onSelectPane(pane.paneId, pane.title)} />
                ))
              )}
            </MotiView>
          );
        })}
      </ScrollView>
    );
  }

  function renderKanban() {
    if (loadingBoard) {
      return (
        <View className="flex-1 justify-center items-center p-8">
          <ActivityIndicator size="large" color={colors.accent} />
          <Text className="text-ostia-muted text-sm mt-3">Loading board</Text>
        </View>
      );
    }

    if (boardColumns.length === 0) {
      return (
        <EmptyState
          icon={Columns}
          title="Board is empty"
          body="Cards will appear once Ostia desktop exposes the board for this workspace."
        />
      );
    }

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-1"
        refreshControl={
          <RefreshControl
            tintColor={colors.accent}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
        contentContainerStyle={{ padding: 16, paddingRight: 8 }}
      >
        {boardColumns.map((column) => (
          <View
            key={column.id}
            style={{ width: boardColumnWidth }}
            className="mr-3 bg-ostia-card border border-ostia-border rounded-lg overflow-hidden"
          >
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-ostia-border/70">
              <Text className="text-ostia-text text-sm font-bold uppercase" numberOfLines={1}>
                {column.title}
              </Text>
              <Pill label={column.cards.length.toString()} tone="neutral" />
            </View>

            <FlatList
              data={column.cards}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
              renderItem={({ item, index }) => (
                <MotiView
                  from={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', delay: index * 45 }}
                  className="bg-ostia-bg border border-ostia-border rounded-lg p-3 mb-3"
                >
                  <Text className="text-ostia-text text-sm font-semibold leading-5">
                    {item.title}
                  </Text>
                  {item.description ? (
                    <Text className="text-ostia-muted text-xs leading-4 mt-1.5" numberOfLines={3}>
                      {item.description}
                    </Text>
                  ) : null}
                  {item.assignee ? (
                    <View className="mt-3 pt-2 border-t border-ostia-border/60 flex-row items-center">
                      <User size={12} color={colors.muted} />
                      <Text className="text-ostia-muted text-xs ml-1.5" numberOfLines={1}>
                        {item.assignee}
                      </Text>
                    </View>
                  ) : null}
                </MotiView>
              )}
              ListEmptyComponent={
                <Text className="text-ostia-muted text-sm italic text-center mt-8">
                  No cards in this column
                </Text>
              }
            />
          </View>
        ))}
      </ScrollView>
    );
  }
}

function Metric({ label, value, urgent }: { label: string; value: string; urgent?: boolean }) {
  return (
    <View className="flex-1 bg-ostia-card border border-ostia-border rounded-lg px-3 py-2 mr-2 last:mr-0">
      <Text className={cn('text-lg font-bold', urgent ? 'text-red-300' : 'text-ostia-text')}>
        {value}
      </Text>
      <Text className="text-ostia-muted text-[11px] font-semibold mt-0.5" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: typeof LayoutGrid;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={cn(
        'flex-1 min-h-10 rounded-md flex-row items-center justify-center',
        active && 'bg-ostia-accentDark/35'
      )}
    >
      <Icon size={15} color={active ? colors.accent : colors.muted} />
      <Text className={cn('text-sm font-semibold ml-2', active ? 'text-ostia-accent' : 'text-ostia-muted')}>
        {label}
      </Text>
    </Pressable>
  );
}

function PaneRow({ pane, onPress }: { pane: Pane; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-16 px-4 py-3 border-b border-ostia-border/55 flex-row items-center"
    >
      <MotiView
        animate={{
          backgroundColor: pane.agentWaiting ? '#3a151c' : '#1b1728',
          borderColor: pane.agentWaiting ? '#fb7185' : '#3a3155',
        }}
        transition={{ type: 'timing', duration: 250 }}
        className="h-10 w-10 rounded-lg border items-center justify-center mr-3"
      >
        <Terminal size={19} color={pane.agentWaiting ? colors.danger : colors.accent} />
      </MotiView>

      <View className="flex-1 pr-3">
        <View className="flex-row items-center">
          <Text className="text-ostia-text text-sm font-bold flex-1" numberOfLines={1}>
            {pane.title || 'Terminal'}
          </Text>
          {pane.agentWaiting ? <Pill label="Needs input" tone="danger" className="ml-2" /> : null}
        </View>
        <Text className="text-ostia-muted text-xs font-mono mt-1" numberOfLines={1}>
          {pane.cwd || 'No path'}
        </Text>
      </View>

      <ChevronRight size={18} color={colors.subtle} />
    </Pressable>
  );
}
