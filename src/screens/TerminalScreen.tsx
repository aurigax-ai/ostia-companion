import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, KeyboardAvoidingView, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Eye, Keyboard } from 'lucide-react-native';
import { AskHeadsUp } from '../components/AskHeadsUp';
import { AskSheet } from '../components/AskSheet';
import { CommandComposer, CommandRuns } from '../components/CommandRuns';
import { FullscreenTerminal } from '../components/FullscreenTerminal';
import { ModeSwitch, TerminalMode } from '../components/ModeSwitch';
import { PromptComposer } from '../components/PromptComposer';
import { TerminalGrid } from '../components/TerminalGrid';
import { KeyBar, RawKeyboard } from '../components/TerminalKeys';
import { TerminalSheet } from '../components/TerminalSheet';
import { answerAsk, interruptAgent, promptAgent, useAsks } from '../services/askStore';
import { Button, Empty, Loading } from '../components/ui';
import { attentionRank, byAttention } from '../model/order';
import { acceptsSwipe, afterClose, EDGE_PT, step } from '../model/terminalPager';
import { TerminalCopy } from '../model/terminalCopy';
import { Pane, paneTitle } from '../model/workspaces';
import { slideMs } from '../services/motion';
import { ScreenProps } from '../navigation';
import { AttachResult, OstiaRpc, Role } from '../services/rpc';
import { useCaps, useWorkspaces } from '../services/workspaceStore';
import { KeyRowEvent, KeyRowState, pressKeyRow } from '../model/terminalKeys';
import { usePrefs } from '../services/prefsStore';
import { colors, radius, space, touch, type } from '../theme';

const RPC_NEEDS_ELEVATION = -32003;
const RENDER_MS = 100;
const INITIAL_COLS = 80;
const INITIAL_ROWS = 24;

export function TerminalScreen({ navigation, route }: ScreenProps<'Terminal'>) {
  const { paneId, title } = route.params;
  const { sessions, panes } = useWorkspaces();
  const knownSession = useRef<string | undefined>(undefined);
  knownSession.current = panes.find((pane) => pane.paneId === paneId)?.sessionId ?? knownSession.current;
  const sessionId = knownSession.current;
  const workspace = sessions.find((session) => session.sessionId === sessionId)?.name ?? '';
  const terminals = useMemo(
    () => byAttention(panes.filter((pane) => pane.sessionId === sessionId && pane.kind === 'terminal'), attentionRank),
    [panes, sessionId],
  );
  const ids = terminals.map((pane) => pane.paneId);
  const index = Math.max(0, ids.indexOf(paneId));
  const [sheetOpen, setSheetOpen] = useState(false);
  const currentPane = panes.find((pane) => pane.paneId === paneId);
  const isAgent = !!currentPane?.agent && currentPane.agent !== 'other';
  const [raw, setRaw] = useState(false);
  const [shellMode, setShellMode] = useState<TerminalMode>('commands');
  const mode: TerminalMode = isAgent ? 'terminal' : shellMode;
  const [fullscreen, setFullscreen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const asks = useAsks();
  const paneAsk = asks.asks.find((ask) => ask.paneId === paneId);
  const [askOpen, setAskOpen] = useState(false);
  const { width } = useWindowDimensions();
  const slide = useRef(new Animated.Value(0)).current;
  const shownIds = useRef(ids);
  const [keyRow, setKeyRow] = useState<KeyRowState>({ ctrl: false });
  const keyRowRef = useRef<KeyRowState>({ ctrl: false });
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const caps = useCaps();
  const canInput = caps.includes('input');
  const canRespond = caps.includes('respond');
  const [role, setRole] = useState<Role>('observer');
  const [attaching, setAttaching] = useState(true);
  const attachingRef = useRef(false);
  const prefs = usePrefs();
  const [error, setError] = useState<string | null>(null);
  const roleRef = useRef<Role>('observer');
  const wantsOwner = useRef(true);
  const [copy, setCopy] = useState(() => new TerminalCopy(INITIAL_COLS, INITIAL_ROWS));
  const [version, setVersion] = useState(0);

  const show = (pane: Pane) => navigation.setParams({ paneId: pane.paneId, title: paneTitle(pane) });

  useEffect(() => {
    const before = shownIds.current;
    shownIds.current = ids;
    if (ids.includes(paneId) || !before.includes(paneId)) return;
    const next = afterClose(before, ids, paneId);
    const pane = terminals.find((p) => p.paneId === next);
    if (pane) show(pane);
    else navigation.goBack();
  }, [ids.join('|')]);

  const swipeTo = (direction: 1 | -1) => {
    const target = step(index, direction, ids.length);
    if (target === index) {
      Animated.spring(slide, { toValue: 0, useNativeDriver: true }).start();
      return;
    }
    Animated.timing(slide, { toValue: -direction * width, duration: slideMs(), useNativeDriver: true }).start(() => {
      show(terminals[target]);
      slide.setValue(direction * width);
      Animated.timing(slide, { toValue: 0, duration: slideMs(), useNativeDriver: true }).start();
    });
  };

  const pager = Gesture.Pan()
    .runOnJS(true)
    .enabled(ids.length > 1 && mode === 'commands')
    .hitSlop({ left: -EDGE_PT, right: -EDGE_PT })
    .activeOffsetX([-EDGE_PT, EDGE_PT])
    .failOffsetY([-EDGE_PT, EDGE_PT])
    .onUpdate((event) => slide.setValue(event.translationX))
    .onEnd((event) => {
      const startX = event.absoluteX - event.translationX;
      if (!acceptsSwipe(startX, width) || Math.abs(event.translationX) < width / 4) {
        Animated.spring(slide, { toValue: 0, useNativeDriver: true }).start();
        return;
      }
      swipeTo(event.translationX < 0 ? 1 : -1);
    });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: !fullscreen,
      headerTitle: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}, list terminals`}
          onPress={() => setSheetOpen(true)}
          style={styles.headerTitle}
        >
          <Text style={type.headline} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.headerSub}>
            <Text style={type.caption} numberOfLines={1}>
              {workspace}
            </Text>
            {ids.length > 1 ? (
              <View style={styles.dots} accessibilityLabel={`Terminal ${index + 1} of ${ids.length}`}>
                {ids.map((id, i) => (
                  <View key={id} style={[styles.dot, i === index && styles.dotOn]} />
                ))}
              </View>
            ) : null}
          </View>
        </Pressable>
      ),
      headerRight: () =>
        isAgent ? (
          raw ? <Button label="Done" variant="text" compact onPress={() => (setRaw(false), setKeyboardOpen(false))} /> : null
        ) : (
          <ModeSwitch value={shellMode} onChange={setShellMode} />
        ),
    });
  }, [navigation, title, workspace, index, ids.join('|'), isAgent, raw, shellMode, fullscreen]);

  useEffect(() => {
    const next = new TerminalCopy(INITIAL_COLS, INITIAL_ROWS);
    setCopy(next);
    setShellMode('commands');
    setFullscreen(false);
    setKeyboardOpen(false);
    setRaw(false);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribeCopy = next.subscribe(() => {
      timer ??= setTimeout(() => {
        timer = null;
        setVersion((n) => n + 1);
      }, RENDER_MS);
    });
    const unsubscribePty = OstiaRpc.addPtyListener((base64) => void next.write(atob(base64)));
    const unsubscribeEvents = OstiaRpc.addEventListener((type, payload) => {
      if (type === 'pty.attached') applyAttach(next, payload);
      else if (type === 'pty.size' && payload?.paneId === paneId) next.resize(payload.cols, payload.rows);
      else if (type === 'rpc.error' && payload?.code === RPC_NEEDS_ELEVATION) explainInput();
    });
    attach(OstiaRpc.hasCap('input') ? 'owner' : 'observer');
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribeCopy();
      unsubscribePty();
      unsubscribeEvents();
      OstiaRpc.detachPty(paneId).catch(() => {});
      next.dispose();
    };
  }, [paneId]);

  useEffect(() => {
    if (canInput && wantsOwner.current && roleRef.current === 'observer' && !attachingRef.current) attach('owner');
  }, [canInput]);

  const applyAttach = (target: TerminalCopy, result: AttachResult) => {
    target.resize(result.cols, result.rows);
    if (result.dropped) target.reset();
    roleRef.current = result.role;
    setRole(result.role);
  };

  const attach = async (target: Role) => {
    attachingRef.current = true;
    setAttaching(true);
    setError(null);
    try {
      await OstiaRpc.attachPty(paneId, target);
    } catch (err: any) {
      setError(err?.message || "Couldn't open this terminal");
    } finally {
      attachingRef.current = false;
      setAttaching(false);
    }
  };

  const explainInput = () => {
    Alert.alert(
      'Typing is off',
      'Turn on Input for this phone in Settings › Remote on your desktop.',
    );
  };

  function takeControl() {
    wantsOwner.current = true;
    if (OstiaRpc.hasCap('input')) attach('owner');
    else explainInput();
  }

  const pressKey = (event: KeyRowEvent) => {
    const result = pressKeyRow(keyRowRef.current, event);
    keyRowRef.current = result.state;
    setKeyRow(result.state);
    if (result.send) OstiaRpc.sendInput(btoa(result.send));
  };

  const typeText = (text: string) => pressKey({ type: 'text', text: text.replace(/\n/g, '\r') });
  const runs = useMemo(() => copy.runs(), [copy, version]);
  const fullscreenRun = runs.find((run) => run.fullscreen);

  useEffect(() => {
    if (fullscreen && !fullscreenRun) setFullscreen(false);
  }, [fullscreen, fullscreenRun]);

  const canType = role === 'owner';
  const showControls = (!isAgent || raw) && !attaching && !error;

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      <GestureDetector gesture={pager}>
      <Animated.View style={[styles.fill, { transform: [{ translateX: slide }] }]}>
        {mode === 'commands' ? (
          runs.length > 0 ? (
            <CommandRuns runs={runs} fontSize={prefs.fontSize} onOpenFullscreen={() => setFullscreen(true)} />
          ) : (
            <View style={styles.fill} testID="commands-view" />
          )
        ) : (
          <View style={styles.inset}>
            <TerminalGrid copy={copy} version={version} />
          </View>
        )}
        {attaching ? (
          <View style={styles.overlay}>
            <Loading label={`Attaching to ${title}…`} />
          </View>
        ) : null}
        {error ? (
          <View style={styles.overlay}>
            <Empty
              title="Terminal unavailable"
              body={error}
              action={<Button label="Try again" variant="tonal" onPress={() => void attach(role)} />}
            />
          </View>
        ) : null}
      </Animated.View>
      </GestureDetector>
      <AskSheet
        ask={askOpen && paneAsk ? paneAsk : null}
        workspace={workspace}
        canRespond={canRespond}
        pending={paneAsk ? asks.pending[paneAsk.askId] : undefined}
        error={paneAsk ? asks.errors[paneAsk.askId] : undefined}
        onAnswer={(answer) => {
          if (!paneAsk) return;
          setAskOpen(false);
          void answerAsk(paneAsk.askId, answer);
        }}
        onClose={() => setAskOpen(false)}
      />
      <TerminalSheet
        visible={sheetOpen}
        workspace={workspace}
        terminals={terminals}
        currentId={paneId}
        onChoose={(pane) => {
          setSheetOpen(false);
          if (pane.paneId !== paneId) show(pane);
        }}
        onClose={() => setSheetOpen(false)}
      />
      {isAgent && !raw && !error ? (
        <>
          {paneAsk ? <AskHeadsUp ask={paneAsk} onOpen={() => setAskOpen(true)} /> : null}
          <PromptComposer
            canRespond={canRespond}
            bottomInset={insets.bottom}
            onPrompt={(text) => void promptAgent(paneId, text)}
            onInterrupt={(key) => void interruptAgent(paneId, key)}
            onKeyboard={() => (setRaw(true), takeControl())}
          />
        </>
      ) : null}
      {showControls && canType ? (
        <View style={styles.controls}>
          {mode === 'commands' && !isAgent ? <CommandComposer editable onRun={(command) => OstiaRpc.sendKeystroke(`${command}\r`)} /> : null}
          {keyboardOpen && (mode === 'terminal' || isAgent) ? (
            <RawKeyboard onText={typeText} onBackspace={() => OstiaRpc.sendInput(btoa('\x7f'))} onEnter={() => pressKey({ type: 'key', key: 'enter' })} />
          ) : null}
          {prefs.keyRow ? (
            <KeyBar
              state={keyRow}
              onEvent={pressKey}
              onKeyboard={mode === 'terminal' || isAgent ? () => setKeyboardOpen((open) => !open) : undefined}
              bottomInset={insets.bottom}
            />
          ) : (
            <View style={{ height: insets.bottom }} />
          )}
        </View>
      ) : null}
      {showControls && !canType ? (
        <View style={[styles.watchBar, { paddingBottom: space.sm + insets.bottom }]}>
          <Eye size={16} color={colors.muted} strokeWidth={2.25} />
          <Text style={[type.bodyMuted, { flex: 1, marginLeft: space.sm }]}>Watching</Text>
          <Button label="Type" icon={Keyboard} compact onPress={takeControl} />
        </View>
      ) : null}
      {fullscreen && fullscreenRun ? (
        <FullscreenTerminal
          copy={copy}
          version={version}
          title={fullscreenRun.command.split(' ')[0] || title}
          keyState={keyRow}
          canType={canType}
          keyboardOpen={keyboardOpen}
          onKey={pressKey}
          onKeyboard={() => setKeyboardOpen((open) => !open)}
          onText={typeText}
          onBackspace={() => OstiaRpc.sendInput(btoa('\x7f'))}
          onEnter={() => pressKey({ type: 'key', key: 'enter' })}
          onBack={() => (setFullscreen(false), setKeyboardOpen(false))}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  inset: { flex: 1, backgroundColor: colors.bg },
  headerTitle: { flexShrink: 1, minHeight: touch, justifyContent: 'center' },
  headerSub: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dots: { flexDirection: 'row', gap: space.xs },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.lineStrong },
  dotOn: { width: 14, backgroundColor: colors.fg },
  fill: { flex: 1, backgroundColor: colors.bg },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: { backgroundColor: colors.surface, paddingTop: space.xs },
  watchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.gutter,
    paddingTop: space.sm,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
});
