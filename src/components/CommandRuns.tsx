import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowUp, ChevronRight } from 'lucide-react-native';
import { CommandRun, DEFAULT_FG, Line } from '../model/terminalCopy';
import { colors, font, radius, space, type } from '../theme';
import { IconButton, NO_SCROLL_BARS } from './ui';

const COLLAPSED_LINES = 12;

export function CommandRuns({
  runs,
  fontSize,
  onOpenFullscreen,
}: {
  runs: CommandRun[];
  fontSize: number;
  onOpenFullscreen: () => void;
}) {
  const scroller = useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={scroller}
      {...NO_SCROLL_BARS}
      testID="commands-view"
      style={styles.list}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
    >
      {runs.map((run) => (
        <RunCard key={run.id} run={run} fontSize={fontSize} onOpenFullscreen={onOpenFullscreen} />
      ))}
    </ScrollView>
  );
}

function RunCard({ run, fontSize, onOpenFullscreen }: { run: CommandRun; fontSize: number; onOpenFullscreen: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const hidden = expanded ? 0 : Math.max(0, run.output.length - COLLAPSED_LINES);
  const shown = hidden > 0 ? run.output.slice(hidden) : run.output;
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
      {shown.length > 0 ? (
        <View style={styles.output}>
          {hidden > 0 ? (
            <Pressable accessibilityRole="button" hitSlop={space.md} onPress={() => setExpanded(true)}>
              <Text style={[type.caption, styles.more]}>{`Show ${hidden} earlier lines`}</Text>
            </Pressable>
          ) : null}
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
}

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
            textDecorationLine: span.underline ? 'underline' : 'none',
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
