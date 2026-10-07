import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, Keyboard } from 'lucide-react-native';
import { TerminalTheme, TerminalView, TerminalViewRef } from 'expo-libghostty';
import { TerminalSheet } from '../components/TerminalSheet';
import { Button, Empty, Loading, tap } from '../components/ui';
import { attentionRank, byAttention } from '../model/order';
import { acceptsSwipe, afterClose, EDGE_PT, step } from '../model/terminalPager';
import { Pane, paneTitle } from '../model/workspaces';
import { slideMs } from '../services/motion';
import { ScreenProps } from '../navigation';
import { AttachResult, OstiaRpc, Role } from '../services/rpc';
import { useCaps, useWorkspaces } from '../services/workspaceStore';
import { KeyRowEvent, KeyRowState, RowKey, pressKeyRow } from '../model/terminalKeys';
import { terminalFontSize } from '../model/prefs';
import { getPrefs, usePrefs } from '../services/prefsStore';
import { colors, mono, type } from '../theme';

const RESIZE_DEBOUNCE_MS = 150;
const SETTLE_FALLBACK_MS = 400;
const FULL_RESET = '\x1bc';
const RPC_NEEDS_ELEVATION = -32003;
const TERMINAL_THEME: TerminalTheme = {
  background: '#161616',
  foreground: '#f2f4f8',
  cursorColor: colors.brand,
  palette: [
    '#161616', '#00dfdb', '#00b4ff', '#ff4297', '#00c15a', '#c693ff', '#ff74b8', '#f2f4f8',
    '#585858', '#00dfdb', '#00b4ff', '#ff4297', '#00c15a', '#c693ff', '#ff74b8', '#f2f4f8',
  ],
};

const ROW_KEYS: { key: RowKey; label: string }[] = [
  { key: 'esc', label: 'esc' },
  { key: 'tab', label: 'tab' },
  { key: 'up', label: '↑' },
  { key: 'down', label: '↓' },
  { key: 'left', label: '←' },
  { key: 'right', label: '→' },
  { key: 'enter', label: '⏎' },
];

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
  const { width } = useWindowDimensions();
  const slide = useRef(new Animated.Value(0)).current;
  const shownIds = useRef(ids);
  const [keyRow, setKeyRow] = useState<KeyRowState>({ ctrl: false });
  const keyRowRef = useRef<KeyRowState>({ ctrl: false });
  const insets = useSafeAreaInsets();
  const terminalRef = useRef<TerminalViewRef>(null);
  const caps = useCaps();
  const canInput = caps.includes('input');
  const [role, setRole] = useState<Role>('observer');
  const [attaching, setAttaching] = useState(true);
  const prefs = usePrefs();
  const [fontSize, setFontSize] = useState(getPrefs().fontSize);
  const fontSizeRef = useRef(getPrefs().fontSize);
  const desktopCols = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const roleRef = useRef<Role>('observer');
  const wantsOwner = useRef(true);
  const explained = useRef(false);
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridSize = useRef<{ cols: number; rows: number } | null>(null);
  const held = useRef<string[] | null>([]);
  const fontChanging = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    .enabled(ids.length > 1)
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
      headerTitle: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}, list terminals`}
          onPress={() => setSheetOpen(true)}
          style={{ flexShrink: 1 }}
        >
          <Text style={styles.headerTitle} numberOfLines={1}>
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
        role === 'owner' ? <Button label="Done" variant="text" compact onPress={watch} /> : null,
    });
  }, [navigation, role, title, workspace, index, ids.join('|')]);

  useEffect(() => {
    const unsubscribePty = OstiaRpc.addPtyListener((base64) => {
      if (held.current) held.current.push(base64);
      else terminalRef.current?.write(base64);
    });
    const unsubscribeEvents = OstiaRpc.addEventListener((type, payload) => {
      if (type === 'pty.attached') applyAttach(payload);
      else if (type === 'rpc.error' && payload?.code === RPC_NEEDS_ELEVATION) explainInput();
    });
    terminalRef.current?.writeText(FULL_RESET);
    held.current = [];
    attach(OstiaRpc.hasCap('input') ? 'owner' : 'observer');
    return () => {
      unsubscribePty();
      unsubscribeEvents();
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      OstiaRpc.detachPty(paneId).catch(() => {});
    };
  }, [paneId]);

  useEffect(() => {
    if (canInput && wantsOwner.current && roleRef.current === 'observer') attach('owner');
  }, [canInput]);

  useEffect(() => {
    if (gridSize.current) settle();
  }, [prefs.fontSize, prefs.fitWhenWatching]);

  const applyAttach = (result: AttachResult) => {
    if (result.dropped) terminalRef.current?.writeText(FULL_RESET);
    roleRef.current = result.role;
    setRole(result.role);
    desktopCols.current = result.cols;
    held.current ??= [];
    settle();
    if (result.role === 'owner' && gridSize.current) {
      OstiaRpc.sendResize(paneId, gridSize.current.cols, gridSize.current.rows);
    }
  };

  const attach = async (target: Role) => {
    setAttaching(true);
    setError(null);
    try {
      await OstiaRpc.attachPty(paneId, target);
    } catch (err: any) {
      setError(err?.message || "Couldn't open this terminal");
    } finally {
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

  function watch() {
    wantsOwner.current = false;
    attach('observer');
  }

  const pressKey = (event: KeyRowEvent) => {
    const result = pressKeyRow(keyRowRef.current, event);
    keyRowRef.current = result.state;
    setKeyRow(result.state);
    if (result.send) OstiaRpc.sendInput(btoa(result.send));
  };

  const handleInput = (base64: string) => {
    if (roleRef.current === 'owner') {
      if (!keyRowRef.current.ctrl) return OstiaRpc.sendInput(base64);
      return pressKey({ type: 'text', text: atob(base64) });
    }
    if (explained.current) return;
    explained.current = true;
    if (OstiaRpc.hasCap('input')) takeControl();
    else explainInput();
  };

  const flush = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    fontChanging.current = false;
    const frames = held.current;
    held.current = null;
    frames?.forEach((frame) => terminalRef.current?.write(frame));
  };

  const settle = () => {
    const measured = gridSize.current;
    if (!measured) return;
    const next = terminalFontSize(
      roleRef.current,
      getPrefs(),
      { cols: measured.cols, fontSize: fontSizeRef.current },
      desktopCols.current,
    );
    if (next === fontSizeRef.current) return flush();
    fontSizeRef.current = next;
    fontChanging.current = true;
    setFontSize(next);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(flush, SETTLE_FALLBACK_MS);
  };

  const handleResize = (cols: number, rows: number) => {
    gridSize.current = { cols, rows };
    if (fontChanging.current) flush();
    else if (held.current && desktopCols.current > 0) settle();
    if (roleRef.current !== 'owner') return;
    if (resizeTimer.current) clearTimeout(resizeTimer.current);
    resizeTimer.current = setTimeout(() => OstiaRpc.sendResize(paneId, cols, rows), RESIZE_DEBOUNCE_MS);
  };

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <GestureDetector gesture={pager}>
      <Animated.View style={[styles.fill, { transform: [{ translateX: slide }] }]}>
        <TerminalView
          ref={terminalRef}
          style={styles.fill}
          theme={TERMINAL_THEME}
          fontSize={fontSize}
          onInput={({ nativeEvent }) => handleInput(nativeEvent.data)}
          onResize={({ nativeEvent }) => handleResize(nativeEvent.cols, nativeEvent.rows)}
        />
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
      {role === 'owner' && prefs.keyRow && !attaching && !error ? (
        <View style={[styles.keyRow, { paddingBottom: 8 + insets.bottom }]}>
          <RowButton label="esc" onPress={() => pressKey({ type: 'key', key: 'esc' })} />
          <RowButton label="tab" onPress={() => pressKey({ type: 'key', key: 'tab' })} />
          <RowButton label="ctrl" active={keyRow.ctrl} onPress={() => pressKey({ type: 'ctrl' })} />
          {ROW_KEYS.slice(2).map(({ key, label }) => (
            <RowButton key={key} label={label} onPress={() => pressKey({ type: 'key', key })} />
          ))}
        </View>
      ) : null}
      {role === 'observer' && !attaching && !error ? (
        <View style={[styles.watchBar, { paddingBottom: 12 + insets.bottom }]}>
          <Eye size={18} color={colors.muted} />
          <Text style={[type.bodyMuted, { flex: 1, marginLeft: 8 }]}>Watching</Text>
          <Button label="Type" icon={Keyboard} compact onPress={takeControl} />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function RowButton({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      onPress={() => (tap(), onPress())}
      android_ripple={{ color: colors.ripple }}
      style={[styles.rowKey, active && styles.rowKeyActive]}
    >
      <Text style={[styles.rowKeyLabel, active && { color: colors.brand }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.fg },
  headerSub: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.lineStrong },
  dotOn: { backgroundColor: colors.fg },
  fill: { flex: 1, backgroundColor: TERMINAL_THEME.background },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: TERMINAL_THEME.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 6,
    padding: 8,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
  },
  rowKey: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  rowKeyActive: { backgroundColor: colors.brandSoft },
  rowKeyLabel: { fontFamily: mono, fontSize: 14, fontWeight: '600', color: colors.fg },
});
