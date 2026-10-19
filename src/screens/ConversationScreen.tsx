import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Bot, ChevronRight, FileText, Globe, LucideIcon, Pencil, Search, Square, SquareTerminal, Wrench } from 'lucide-react-native';
import { AskCard } from '../components/AskCard';
import { AskSheet } from '../components/AskSheet';
import { ChatComposer } from '../components/ChatComposer';
import { Button, Empty, HeaderTitle, IconButton, Loading, NO_SCROLL_BARS, Sheet, Warning } from '../components/ui';
import { Step, StepKind, stepFailed, stepLine, Turn, TurnList, turnRunning, turnSummary } from '../model/turns';
import { paneTitle } from '../model/workspaces';
import { ScreenProps } from '../navigation';
import { answerAsk, interruptAgent, promptAgent, useAsks } from '../services/askStore';
import { OstiaRpc } from '../services/rpc';
import { loadStepOutput, loadTurns } from '../services/turns';
import { useCaps, useWorkspaces } from '../services/workspaceStore';
import { colors, font, radius, space, type } from '../theme';

const POLL_MS = 3000;
const EVENT_DELAY_MS = 300;
const NEAR_BOTTOM = 80;

const ICONS: Record<StepKind, LucideIcon> = {
  edit: Pencil,
  command: SquareTerminal,
  search: Search,
  read: FileText,
  subagent: Bot,
  web: Globe,
  other: Wrench,
};

type Output = { step: Step; text: string | null; problem: string | null };

function StepRow({ step, onOpen }: { step: Step; onOpen: (step: Step) => void }) {
  const Icon = ICONS[step.kind];
  const failed = stepFailed(step);
  const body = (
    <>
      <Icon size={14} color={colors.muted} strokeWidth={2.25} />
      <Text style={[type.mono, styles.stepText]} numberOfLines={1}>
        {stepLine(step)}
      </Text>
      {failed ? <Text style={[type.mono, styles.failed]}>exit {step.exitCode}</Text> : null}
      {step.output ? <ChevronRight size={14} color={colors.dim} strokeWidth={2.25} /> : null}
    </>
  );
  if (!step.output) return <View style={styles.step}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${stepLine(step)}, show output`} onPress={() => onOpen(step)} style={styles.step}>
      {body}
    </Pressable>
  );
}

function TurnView({ turn, agent, onOpen }: { turn: Turn; agent: string; onOpen: (step: Step) => void }) {
  const summary = turnSummary(turn);
  return (
    <View style={styles.turn}>
      {turn.prompt ? (
        <View style={styles.prompt}>
          <Text style={type.body} selectable>
            {turn.prompt}
          </Text>
        </View>
      ) : null}
      {turn.steps.length > 0 ? (
        <View style={styles.steps}>
          {turn.steps.map((step) => (
            <StepRow key={step.id} step={step} onOpen={onOpen} />
          ))}
        </View>
      ) : null}
      {turn.final ? (
        <View style={styles.answer}>
          <Text style={type.caption}>{agent}</Text>
          <Text style={[type.body, styles.final]} selectable>
            {turn.final}
          </Text>
        </View>
      ) : null}
      {!turn.ended ? (
        <View style={styles.working}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={type.caption}>Working</Text>
        </View>
      ) : summary ? (
        <Text style={[type.caption, styles.summary]}>{summary}</Text>
      ) : null}
    </View>
  );
}

export function ConversationScreen({ navigation, route }: ScreenProps<'Conversation'>) {
  const { paneId, title } = route.params;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const canRespond = useCaps().includes('respond');
  const { sessions, panes } = useWorkspaces();
  const asks = useAsks();
  const pane = panes.find((p) => p.paneId === paneId);
  const workspace = sessions.find((s) => s.sessionId === pane?.sessionId);
  const agent = pane?.agent && pane.agent !== 'other' ? pane.agent : title;
  const heading = pane ? paneTitle(pane) : title;
  const [list, setList] = useState<TurnList | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sendProblem, setSendProblem] = useState<string | null>(null);
  const loaded = useRef(false);
  const nearBottom = useRef(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [output, setOutput] = useState<Output | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const ownAsks = asks.asks.filter((ask) => ask.paneId === paneId);
  const running = (list ? turnRunning(list) : false) || pane?.agentState === 'working';

  const openTerminal = useCallback(() => navigation.navigate('Terminal', { paneId, title }), [navigation, paneId, title]);

  const reload = useCallback(async () => {
    const result = await loadTurns(paneId, !loaded.current);
    if (result.kind === 'terminal') return navigation.replace('Terminal', { paneId, title });
    if (result.kind === 'error') return setProblem(result.text);
    loaded.current = true;
    setProblem(null);
    setList(result.list);
  }, [navigation, paneId, title]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderTitle title={heading} subtitle={workspace?.name} />,
      headerRight: () => <IconButton icon={SquareTerminal} label="Open the terminal" onPress={openTerminal} />,
    });
  }, [navigation, heading, workspace?.name, openTerminal]);

  useEffect(() => {
    void reload();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const remove = OstiaRpc.addEventListener((type, payload) => {
      const ours = (type === 'pane.state' && payload?.paneId === paneId) || (type === 'session.state' && payload?.sessionId === pane?.sessionId);
      if (!ours) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void reload(), EVENT_DELAY_MS);
    });
    return () => {
      remove();
      if (timer) clearTimeout(timer);
    };
  }, [reload, paneId, pane?.sessionId]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, reload]);

  const openOutput = async (step: Step) => {
    setOutput({ step, text: null, problem: null });
    const result = await loadStepOutput(paneId, step.id);
    setOutput((shown) => (shown?.step.id === step.id ? { step, text: result.ok ? result.output : null, problem: result.ok ? null : result.text } : shown));
  };

  const send = async () => {
    const prompt = text.trim();
    if (!prompt) return;
    setSending(true);
    setSendProblem(null);
    try {
      await promptAgent(paneId, prompt);
      setText('');
    } catch (err: any) {
      setSendProblem(err?.message === 'not-submitted' ? `${agent} did not start a turn. Your message is still in its prompt on the desktop.` : err?.message || 'Could not send.');
    } finally {
      setSending(false);
      void reload();
    }
  };

  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={headerHeight}>
      {list === null && !problem ? (
        <Loading />
      ) : (
        <ScrollView
          {...NO_SCROLL_BARS}
          ref={scroll}
          style={styles.fill}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => nearBottom.current && scroll.current?.scrollToEnd({ animated: false })}
          onLayout={() => nearBottom.current && scroll.current?.scrollToEnd({ animated: false })}
          onScroll={({ nativeEvent }) => {
            nearBottom.current = nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height >= nativeEvent.contentSize.height - NEAR_BOTTOM;
          }}
          scrollEventThrottle={100}
          keyboardShouldPersistTaps="handled"
        >
          {list?.truncated ? <Text style={[type.caption, styles.center]}>Older turns stay on the desktop.</Text> : null}
          {list && list.turns.length === 0 ? (
            <Empty icon={Bot} title="No turns yet" body="The thread starts at the next prompt this agent gets." />
          ) : null}
          {list?.turns.map((turn) => <TurnView key={turn.id} turn={turn} agent={agent} onOpen={(step) => void openOutput(step)} />)}
          {ownAsks.map((ask) => (
            <View key={ask.askId} style={styles.ask}>
              <AskCard
              ask={ask}
              workspace=""
              canRespond={canRespond}
              pending={asks.pending[ask.askId]}
              error={asks.errors[ask.askId]}
              onAnswer={(answer) => void answerAsk(ask.askId, answer)}
              onReply={() => setReplyTo(ask.askId)}
              compact
              />
            </View>
          ))}
          {problem ? <Warning text={problem} /> : null}
          {sendProblem ? <Warning text={sendProblem} /> : null}
        </ScrollView>
      )}
      {running && canRespond ? (
        <View style={styles.stop}>
          <Button label="Stop" icon={Square} variant="tonal" compact onPress={() => void interruptAgent(paneId, 'esc')} />
        </View>
      ) : null}
      <ChatComposer
        value={text}
        onChangeText={setText}
        onSend={() => void send()}
        placeholder={canRespond ? `Message ${agent}` : 'Turn on Respond in Settings › Remote'}
        editable={canRespond}
        sending={sending}
        snippetsFrom={pane?.sessionId ?? null}
        workspaces={sessions.filter((s) => s.kind !== 'scratch' && s.kind !== 'manager')}
        bottomInset={insets.bottom}
      />
      <AskSheet
        ask={ownAsks.find((ask) => ask.askId === replyTo) ?? null}
        workspace={workspace?.name ?? ''}
        canRespond={canRespond}
        pending={replyTo ? asks.pending[replyTo] : undefined}
        error={replyTo ? asks.errors[replyTo] : undefined}
        onAnswer={(answer) => {
          if (!replyTo) return;
          void answerAsk(replyTo, answer);
          setReplyTo(null);
        }}
        onClose={() => setReplyTo(null)}
      />
      <Sheet visible={output !== null} onClose={() => setOutput(null)}>
        {output ? (
          <View>
            <Text style={[type.captionStrong, styles.sheetTitle]} numberOfLines={2}>
              {stepLine(output.step)}
            </Text>
            {output.problem ? (
              <Warning text={output.problem} />
            ) : output.text === null ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <ScrollView {...NO_SCROLL_BARS} style={styles.output}>
                <Text style={styles.outputText} selectable>
                  {output.text || 'No output.'}
                </Text>
              </ScrollView>
            )}
          </View>
        ) : null}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  thread: { paddingHorizontal: space.gutter, paddingTop: space.lg, paddingBottom: space.lg, gap: space.xl, flexGrow: 1 },
  center: { textAlign: 'center' },
  turn: { gap: space.md },
  prompt: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceHigh,
  },
  steps: { gap: 2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 28 },
  stepText: { flex: 1 },
  failed: { color: colors.attn },
  answer: { gap: space.xs },
  final: { lineHeight: 24 },
  working: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  summary: { color: colors.dim },
  ask: { marginHorizontal: -space.gutter },
  stop: { alignItems: 'flex-start', paddingHorizontal: space.gutter, paddingBottom: space.sm },
  sheetTitle: { paddingHorizontal: space.xs, paddingBottom: space.md },
  output: { maxHeight: 480, borderRadius: radius.md, backgroundColor: colors.bgSunken, padding: space.md },
  outputText: { fontFamily: font.mono, fontSize: 12, lineHeight: 17, color: colors.fg },
});
