import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Keyboard as RNKeyboard, KeyboardAvoidingView, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Eye, Keyboard } from 'lucide-react-native';
import { AskHeadsUp } from '../components/AskHeadsUp';
import { AskSheet } from '../components/AskSheet';
import { CommandComposer, CommandRuns } from '../components/CommandRuns';
import { FullscreenTerminal } from '../components/FullscreenTerminal';
import { AGENT_MODES, ModeSwitch, SHELL_MODES, SwitchValue, TerminalMode } from '../components/ModeSwitch';
import { PromptComposer } from '../components/PromptComposer';
import { TerminalGrid } from '../components/TerminalGrid';
import { KeyBar, RawKeyboard } from '../components/TerminalKeys';
import { TerminalSheet } from '../components/TerminalSheet';
import { answerAsk, interruptAgent, promptAgent, useAsks } from '../services/askStore';
import { Button, Empty, Loading } from '../components/ui';
import { attentionRank, byAttention } from '../model/order';
import { acceptsSwipe, afterClose, EDGE_PT, step } from '../model/terminalPager';
import { CommandRun, TerminalCopy } from '../model/terminalCopy';
import { Box, Grid, phoneGrid } from '../model/terminalFit';
import { Pane, paneScreen, paneTitle } from '../model/workspaces';
import { slideMs } from '../services/motion';
import { ScreenProps } from '../navigation';
import { AttachResult, OstiaRpc, Role } from '../services/rpc';
import { useCaps, useWorkspaces } from '../services/workspaceStore';
import { KeyRowEvent, KeyRowState, encodeText, pressKeyRow } from '../model/terminalKeys';
import { usePrefs } from '../services/prefsStore';
import { HoldStatus, useTerminalHold } from '../services/terminalHold';
import { colors, radius, space, touch, type } from '../theme';

const RPC_NEEDS_ELEVATION = -32003;
const RENDER_MS = 100;
const INITIAL_COLS = 80;
const INITIAL_ROWS = 24;
const NO_RUNS: CommandRun[] = [];

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
  const copy = useMemo(() => new TerminalCopy(INITIAL_COLS, INITIAL_ROWS), [paneId]);
  const [attachCount, setAttachCount] = useState(0);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const lastGrid = useRef<Grid | null>(null);
  const [version, setVersion] = useState(0);
  const [gridBox, setGridBox] = useState<Box | null>(null);
  const noteSize = useRef<(cols: number, rows: number) => void>(() => {});

  const chatAvailable = !!currentPane && paneScreen(currentPane) === 'Conversation';
  const openChat = (next: SwitchValue) => next === 'chat' && navigation.replace('Conversation', { paneId, title });

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
          <View style={styles.headerRight}>
            {chatAvailable ? <ModeSwitch value="terminal" options={AGENT_MODES} onChange={openChat} /> : null}
            {raw ? <Button label="Done" variant="text" compact onPress={() => (setRaw(false), setKeyboardOpen(false))} /> : null}
          </View>
        ) : (
          <ModeSwitch value={shellMode} options={SHELL_MODES} onChange={(next) => setShellMode(next as TerminalMode)} />
        ),
    });
  }, [navigation, title, workspace, index, ids.join('|'), isAgent, chatAvailable, raw, shellMode, fullscreen]);

  useEffect(() => {
    const next = copy;
    setAttachCount(0);
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
      if (type === 'pty.attached') {
        if (payload?.paneId === paneId) applyAttach(next, payload);
      } else if (type === 'pty.size' && payload?.paneId === paneId) {
        noteSize.current(payload.cols, payload.rows);
        next.resize(payload.cols, payload.rows);
      }
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
    void target.resize(result.cols, result.rows);
    if (result.dropped) void target.reset();
    roleRef.current = result.role;
    setRole(result.role);
    setAttachCount((n) => n + 1);
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
    if (result.send) OstiaRpc.sendKeystroke(result.send);
  };

  const typeText = (text: string) => pressKey({ type: 'text', text: encodeText(text, copy.bracketedPaste) });
  const backspace = () => OstiaRpc.sendKeystroke('\x7f');
  const runs = useMemo(() => (mode === 'commands' && !isAgent ? copy.runs() : NO_RUNS), [copy, version, mode, isAgent]);
  const fullscreenCommand = useMemo(() => copy.fullscreenCommand(), [copy, version]);

  useEffect(() => {
    if (fullscreen && fullscreenCommand === null) setFullscreen(false);
  }, [fullscreen, fullscreenCommand]);

  useEffect(() => {
    if (!fullscreen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setFullscreen(false);
      setKeyboardOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [fullscreen]);

  useEffect(() => {
    const show = RNKeyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
    const hide = RNKeyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const canType = role === 'owner';
  const showControls = (!isAgent || raw) && !attaching && !error;
  const gridShown = mode === 'terminal' || fullscreen;
  useEffect(() => {
    setGridBox(null);
    lastGrid.current = null;
  }, [gridShown, fullscreen, paneId]);
  const sideways = !fullscreen || (gridBox !== null && gridBox.width > gridBox.height);
  const measured = sideways ? phoneGrid(gridBox, prefs.fontSize) : null;
  if (!keyboardUp && measured) lastGrid.current = measured;
  const hold = useTerminalHold({
    paneId,
    active: canType && !attaching && !error && gridShown,
    grid: keyboardUp ? lastGrid.current : measured,
    attachCount,
  });
  noteSize.current = hold.noteSize;

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
            <HoldNote status={hold.status} onAgain={hold.holdAgain} />
            <TerminalGrid copy={copy} version={version} onMeasure={setGridBox} />
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
            <RawKeyboard onText={typeText} onBackspace={backspace} onEnter={() => pressKey({ type: 'key', key: 'enter' })} />
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
      {fullscreen && fullscreenCommand !== null ? (
        <FullscreenTerminal
          copy={copy}
          version={version}
          title={fullscreenCommand.split(' ')[0] || title}
          keyState={keyRow}
          holdStatus={hold.status}
          onMeasure={setGridBox}
          canType={canType}
          keyboardOpen={keyboardOpen}
          onKey={pressKey}
          onKeyboard={() => setKeyboardOpen((open) => !open)}
          onText={typeText}
          onBackspace={backspace}
          onEnter={() => pressKey({ type: 'key', key: 'enter' })}
          onBack={() => (setFullscreen(false), setKeyboardOpen(false))}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

function HoldNote({ status, onAgain }: { status: HoldStatus; onAgain: () => void }) {
  return (
    <View style={styles.holdNote} testID="hold-note">
      <Text style={[type.caption, { flex: 1 }]}>{status === 'held' ? 'Sized to this phone' : status === 'taken' ? 'The desktop took its size back' : ''}</Text>
      {status === 'taken' ? <Button label="Size to this phone" variant="text" compact onPress={onAgain} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  holdNote: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.gutter, height: 32 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
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
