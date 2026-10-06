import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { MotiView } from 'moti';
import { AlertTriangle, ChevronRight, Folder, Power, RefreshCw, Terminal } from 'lucide-react-native';
import { connectionNotice } from '../services/connectionNotice';
import { openTailscaleApp } from '../services/openTailscaleApp';
import { ConnectionStatus, OstiaRpc } from '../services/rpc';
import { clearPairingData, getPairingData } from '../services/storage';
import { Button, EmptyState, IconButton, Pill, Screen, cn, colors } from '../components/ui';

interface DashboardScreenProps {
  onSelectPane: (paneId: string, title: string) => void;
  onUnpair: () => void;
}

type SessionState = 'idle' | 'working' | 'waiting' | 'done' | 'error';

interface Session {
  id: string;
  name: string;
  kind: string;
  workDir: string;
  state: SessionState;
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
}

const SESSION_STATE_TONE: Record<SessionState, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  idle: 'neutral',
  working: 'accent',
  waiting: 'danger',
  done: 'success',
  error: 'danger',
};

export function DashboardScreen({ onSelectPane, onUnpair }: DashboardScreenProps) {
  const [desktopName, setDesktopName] = useState('Ostia Desktop');
  const [gatewayHost, setGatewayHost] = useState('');
  const [connStatus, setConnStatus] = useState<ConnectionStatus>(OstiaRpc.getStatus());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [panes, setPanes] = useState<Pane[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notice = connectionNotice(connStatus, gatewayHost);
  const waitingCount = sessions.filter((session) => session.state === 'waiting').length;
  const runningCount = panes.filter((pane) => pane.running).length;

  const statusTone = useMemo(() => {
    if (connStatus === 'connected') return 'success';
    if (connStatus === 'connecting') return 'warning';
    return 'danger';
  }, [connStatus]);

  useEffect(() => {
    getPairingData().then((data) => {
      if (data) {
        setDesktopName(data.desktopName || 'Ostia Desktop');
        setGatewayHost(data.gatewayHost);
      }
    });

    const unsubscribeStatus = OstiaRpc.addStatusListener((status) => {
      setConnStatus(status);
      if (status === 'connected') fetchWorkspaceData();
    });

    const unsubscribeEvents = OstiaRpc.addEventListener((type, payload) => {
      if (type === 'pane.state') updatePaneState(payload);
      else if (type === 'session.state') setSessionState(payload.sessionId, payload.state);
      else if (type === 'agent.needs-input') setSessionState(payload.sessionId, 'waiting');
      else if (type === 'agent.done') setSessionState(payload.sessionId, 'done');
    });

    if (OstiaRpc.getStatus() === 'connected') fetchWorkspaceData();
    else setLoading(false);

    return () => {
      unsubscribeStatus();
      unsubscribeEvents();
    };
  }, []);

  const fetchWorkspaceData = async () => {
    setLoading(true);
    setError(null);
    try {
      const sessionResult = await OstiaRpc.call('session.list');
      const paneResult = await OstiaRpc.call('pane.list');
      setSessions(sessionResult.sessions || []);
      setPanes(paneResult.panes || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch workspaces');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const updatePaneState = (update: Partial<Pane> & { paneId: string }) => {
    setPanes((prev) => prev.map((pane) => (pane.paneId === update.paneId ? { ...pane, ...update } : pane)));
  };

  const setSessionState = (sessionId: string, state: SessionState) => {
    setSessions((prev) => prev.map((session) => (session.id === sessionId ? { ...session, state } : session)));
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchWorkspaceData();
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
            <IconButton label="Refresh workspaces" icon={RefreshCw} onPress={handleRefresh} className="mr-2" />
            <IconButton label="Disconnect device" icon={Power} danger onPress={handleUnpair} />
          </View>
        </View>

        <View className="flex-row mt-4">
          <Metric label="Workspaces" value={sessions.length.toString()} />
          <Metric label="Panes" value={panes.length.toString()} />
          <Metric label="Running" value={runningCount.toString()} />
          <Metric label="Waiting" value={waitingCount.toString()} urgent={waitingCount > 0} />
        </View>
      </View>

      {notice ? (
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          style={{
            backgroundColor: 'rgba(251, 191, 36, 0.08)',
            borderColor: 'rgba(251, 191, 36, 0.25)',
          }}
          className="mx-4 mt-4 p-3 rounded-lg border"
        >
          <View className="flex-row items-center">
            <AlertTriangle size={16} color="#fbbf24" />
            <Text style={{ color: '#fde68a' }} className="text-xs font-semibold ml-2 flex-1 leading-4">
              {notice.text}
            </Text>
          </View>
          {notice.actions.length > 0 ? (
            <View className="flex-row mt-3">
              {notice.actions.includes('open-tailscale') ? (
                <Button
                  label="Open Tailscale"
                  variant="secondary"
                  onPress={() => void openTailscaleApp()}
                  className="mr-2"
                />
              ) : null}
              {notice.actions.includes('pair-again') ? (
                <Button label="Pair again" variant="secondary" onPress={handleUnpair} />
              ) : null}
            </View>
          ) : null}
        </MotiView>
      ) : null}

      {loading ? (
        <View className="flex-1 justify-center items-center p-8">
          <ActivityIndicator size="large" color={colors.accent} />
          <Text className="text-ostia-muted text-sm mt-3">Loading workspaces</Text>
        </View>
      ) : (
        renderWorkspace()
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
          title="No open workspaces"
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
              <View className="px-4 py-4 border-b border-ostia-border">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-ostia-text text-base font-bold" numberOfLines={1}>
                      {session.name || 'Untitled workspace'}
                    </Text>
                    <Text className="text-ostia-muted text-xs font-mono mt-1" numberOfLines={1}>
                      {session.workDir || 'No working directory'}
                    </Text>
                  </View>
                  <Pill
                    label={session.state === 'waiting' ? 'needs you' : session.state}
                    tone={SESSION_STATE_TONE[session.state] ?? 'neutral'}
                  />
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

function PaneRow({ pane, onPress }: { pane: Pane; onPress: () => void }) {
  const failed = !pane.running && pane.lastExitCode !== undefined && pane.lastExitCode !== 0;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-16 px-4 py-3 border-b border-ostia-border flex-row items-center"
    >
      <View
        style={{ backgroundColor: failed ? '#3a151c' : '#1b1728', borderColor: failed ? '#fb7185' : '#3a3155' }}
        className="h-10 w-10 rounded-lg border items-center justify-center mr-3"
      >
        <Terminal size={19} color={failed ? colors.danger : colors.accent} />
      </View>

      <View className="flex-1 pr-3">
        <View className="flex-row items-center">
          <Text className="text-ostia-text text-sm font-bold flex-1" numberOfLines={1}>
            {pane.title || 'Terminal'}
          </Text>
          {pane.running ? (
            <Pill label="running" tone="accent" className="ml-2" />
          ) : failed ? (
            <Pill label={`exit ${pane.lastExitCode}`} tone="danger" className="ml-2" />
          ) : null}
        </View>
        {pane.cwd ? (
          <Text className="text-ostia-muted text-xs font-mono mt-1" numberOfLines={1}>
            {pane.cwd}
          </Text>
        ) : null}
      </View>

      <ChevronRight size={18} color={colors.subtle} />
    </Pressable>
  );
}
