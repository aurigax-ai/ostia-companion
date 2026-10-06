import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, Keyboard } from 'lucide-react-native';
import { TerminalTheme, TerminalView, TerminalViewRef } from 'expo-libghostty';
import { Button, Empty, HeaderIcon } from '../components/ui';
import { ScreenProps } from '../navigation';
import { AttachResult, OstiaRpc, Role } from '../services/rpc';
import { useCaps } from '../services/workspaceStore';
import { TERMINAL_FONT_SIZE, watchFontSize } from '../model/terminalFit';
import { colors, type } from '../theme';

const RESIZE_DEBOUNCE_MS = 150;
const SETTLE_FALLBACK_MS = 400;
const FULL_RESET = '\x1bc';
const RPC_NEEDS_ELEVATION = -32003;
const TERMINAL_THEME: TerminalTheme = {
  background: colors.bgSunken,
  foreground: colors.fg,
  cursorColor: colors.brand,
  palette: ['#16161a', '#ff6c6b', '#98be65', '#ecbe7b', '#51afef', '#c678dd', '#46d9ff', '#bbc2cf'],
};

export function TerminalScreen({ navigation, route }: ScreenProps<'Terminal'>) {
  const { paneId } = route.params;
  const insets = useSafeAreaInsets();
  const terminalRef = useRef<TerminalViewRef>(null);
  const caps = useCaps();
  const canInput = caps.includes('input');
  const [role, setRole] = useState<Role>('observer');
  const [attaching, setAttaching] = useState(true);
  const [fontSize, setFontSize] = useState(TERMINAL_FONT_SIZE);
  const fontSizeRef = useRef(TERMINAL_FONT_SIZE);
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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        role === 'owner' ? (
          <HeaderIcon icon={Eye} label="Stop typing, only watch" onPress={watch} />
        ) : (
          <HeaderIcon icon={Keyboard} label="Type in this terminal" onPress={takeControl} color={colors.brand} />
        ),
    });
  }, [navigation, role, canInput]);

  useEffect(() => {
    const unsubscribePty = OstiaRpc.addPtyListener((base64) => {
      if (held.current) held.current.push(base64);
      else terminalRef.current?.write(base64);
    });
    const unsubscribeEvents = OstiaRpc.addEventListener((type, payload) => {
      if (type === 'pty.attached') applyAttach(payload);
      else if (type === 'rpc.error' && payload?.code === RPC_NEEDS_ELEVATION) explainInput();
    });
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
      setError(err?.message || 'Could not open this terminal');
    } finally {
      setAttaching(false);
    }
  };

  const explainInput = () => {
    Alert.alert(
      'Typing is off for this phone',
      'On your desktop, open Ostia Settings → Remote and turn on Input for this phone. This terminal switches to typing as soon as it is on.',
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

  const handleInput = (base64: string) => {
    if (roleRef.current === 'owner') return OstiaRpc.sendInput(base64);
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
    const next =
      roleRef.current === 'owner'
        ? TERMINAL_FONT_SIZE
        : watchFontSize({ cols: measured.cols, fontSize: fontSizeRef.current }, desktopCols.current);
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <View style={[styles.fill, role === 'owner' && { paddingBottom: insets.bottom }]}>
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
            <ActivityIndicator size="large" color={colors.brand} />
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
      </View>
      {role === 'observer' && !attaching && !error ? (
        <View style={[styles.watchBar, { paddingBottom: 12 + insets.bottom }]}>
          <Text style={[type.bodyMuted, { flex: 1 }]}>You are watching this terminal.</Text>
          <Button label="Type" variant="text" onPress={takeControl} />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bgSunken },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bgSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 4,
    paddingTop: 4,
    backgroundColor: colors.surface,
  },
});
