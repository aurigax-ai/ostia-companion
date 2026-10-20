import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowUp, ChevronRight } from 'lucide-react-native';
import { CommandRun, DEFAULT_FG, Line } from '../model/terminalCopy';
import { colors, font, radius, space, type } from '../theme';
import { IconButton, NO_SCROLL_BARS } from './ui';

export const PAGE_LINES = 200;
const BOTTOM_SLACK = 32;

export function CommandRuns({
  runs,
  fontSize,
  onOpenFullscreen,
}: {
  runs: CommandRun[];
  fontSize: number;
  onOpenFullscreen: () => void;
}) {
  const list = useRef<FlatList<CommandRun>>(null);
  const atBottom = useRef(true);
  const offset = useRef(0);
  const height = useRef(0);
  const expanding = useRef(false);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    offset.current = contentOffset.y;
    atBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - BOTTOM_SLACK;
  }, []);
  const onContentSizeChange = useCallback((_: number, next: number) => {
    const grew = next - height.current;
    height.current = next;
    if (expanding.current) {
      expanding.current = false;
      list.current?.scrollToOffset({ offset: offset.current + grew, animated: false });
    } else if (atBottom.current) list.current?.scrollToEnd({ animated: false });
  }, []);
  const onExpand = useCallback(() => {
    expanding.current = true;
  }, []);
  const renderItem = useCallback(
    ({ item }: { item: CommandRun }) => <RunCard run={item} fontSize={fontSize} onOpenFullscreen={onOpenFullscreen} onExpand={onExpand} />,
    [fontSize, onOpenFullscreen, onExpand],
  );
  return (
    <FlatList
      {...NO_SCROLL_BARS}
      ref={list}
      testID="commands-view"
      style={styles.list}
      contentContainerStyle={styles.content}
      data={runs}
      keyExtractor={(run) => String(run.id)}
      renderItem={renderItem}
      onScroll={onScroll}
      scrollEventThrottle={32}
      onContentSizeChange={onContentSizeChange}
      initialNumToRender={12}
      windowSize={9}
    />
  );
}

const RunCard = memo(function RunCard({
  run,
  fontSize,
  onOpenFullscreen,
  onExpand,
}: {
  run: CommandRun;
  fontSize: number;
  onOpenFullscreen: () => void;
  onExpand: () => void;
}) {
  const [limit, setLimit] = useState(PAGE_LINES);
  const hidden = Math.max(0, run.output.length - limit);
  const shown = useMemo(() => (hidden > 0 ? run.output.slice(hidden) : run.output), [run.output, hidden]);
  const failed = run.exitCode !== null && run.exitCode !== 0;
  const header = (
    <View style={styles.head}>
      {run.command ? <Text style={[styles.command, { fontSize }]} selectable={!run.fullscreen}>{`$ ${run.command}`}</Text> : <Text style={type.captionStrong}>Output</Text>}
      <View style={styles.status}>
        {run.fullscreen ? (
          <>
            <Text style={type.captionStrong}>full screen</Text>
            <ChevronRight size={16} color={colors.muted} strokeWidth={2.25} />
          </>
        ) : run.running ? (
          <ActivityIndicator size="small" color={colors.brand} />
        ) : run.exitCode !== null ? (
          <Text style={[type.captionStrong, failed && { color: colors.attn }]}>{failed ? `exit ${run.exitCode}` : 'done'}</Text>
        ) : null}
      </View>
    </View>
  );
  return (
    <View style={styles.card} testID="command-run">
      {run.fullscreen ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${run.command}, open full screen`} onPress={onOpenFullscreen} android_ripple={{ color: colors.ripple }}>
          {header}
        </Pressable>
      ) : (
        header
      )}
      {shown.length > 0 || run.trimmed ? (
        <View style={styles.output}>
          {hidden > 0 ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={space.md}
              onPress={() => {
                onExpand();
                setLimit((n) => n + PAGE_LINES);
              }}
            >
              <Text style={[type.caption, styles.more]}>{`Show ${Math.min(hidden, PAGE_LINES)} earlier lines`}</Text>
            </Pressable>
          ) : null}
          {hidden === 0 && run.trimmed ? <Text style={type.caption}>Earlier output trimmed</Text> : null}
          <Text selectable style={{ fontFamily: font.mono, fontSize, lineHeight: Math.round(fontSize * 1.35), color: DEFAULT_FG }}>
            {shown.map((line, i) => (
              <Text key={i}>
                {i > 0 ? '\n' : ''}
                <LineText line={line} />
              </Text>
            ))}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

function LineText({ line }: { line: Line }) {
  return (
    <>
      {line.map((span, i) => (
        <Text
          key={i}
          style={{
            color: span.fg ?? DEFAULT_FG,
            backgroundColor: span.bg,
            fontFamily: span.bold ? font.monoSemibold : font.mono,
            opacity: span.dim ? 0.6 : 1,
            fontStyle: span.italic ? 'italic' : 'normal',
            textDecorationLine: span.underline && span.strike ? 'underline line-through' : span.underline ? 'underline' : span.strike ? 'line-through' : 'none',
          }}
        >
          {span.text}
        </Text>
      ))}
    </>
  );
}

export function CommandComposer({ onRun, editable }: { onRun: (command: string) => void; editable: boolean }) {
  const [text, setText] = useState('');
  const send = () => {
    onRun(text);
    setText('');
  };
  return (
    <View style={styles.composer}>
      <Text style={styles.prompt}>$</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        onSubmitEditing={send}
        submitBehavior="submit"
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Run a command"
        placeholderTextColor={colors.dim}
        cursorColor={colors.brand}
        accessibilityLabel="Command"
      />
      <IconButton icon={ArrowUp} label="Run" variant="filled" onPress={send} color={colors.onBrand} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.gutter, gap: space.sm, flexGrow: 1, justifyContent: 'flex-end' },
  card: { borderRadius: radius.md, backgroundColor: colors.surface, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 32 },
  command: { flex: 1, fontFamily: font.monoSemibold, color: colors.fg },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  output: { paddingHorizontal: space.md, paddingBottom: space.sm, gap: space.xs },
  more: { color: colors.brand },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.gutter,
    marginTop: space.sm,
    paddingLeft: space.md,
    borderRadius: radius.full,
    backgroundColor: colors.bgSunken,
  },
  prompt: { fontFamily: font.monoSemibold, fontSize: 13, color: colors.brand },
  input: { flex: 1, height: 36, paddingVertical: 0, color: colors.fg, fontFamily: font.mono, fontSize: 13 },
});
