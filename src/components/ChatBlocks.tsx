import React, { memo, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Block, clipHead, MAX_DIFF_LINES, parseDiff, planDone, toolFailed, toolTarget, toolVerb, Turn, visibleBlocks, workingFor } from '../model/agentStream';
import { colors, font, radius, space, type } from '../theme';

const DIFF_PREVIEW = 40;

type ToolBlock = Extract<Block, { kind: 'tool' }>;

export function ToolLine({ block, onOpen }: { block: ToolBlock; onOpen: (block: ToolBlock) => void }) {
  const failed = toolFailed(block);
  const target = toolTarget(block);
  const body = (
    <>
      <Text style={[type.caption, styles.verb]}>{toolVerb(block.tool)}</Text>
      <Text style={[type.mono, styles.target]} numberOfLines={1}>
        {target}
      </Text>
      {failed ? <Text style={[type.mono, styles.failed]}>{block.exitCode !== undefined ? `· exit ${block.exitCode}` : '· failed'}</Text> : null}
    </>
  );
  if (!block.output && !block.input) return <View style={styles.tool}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${toolVerb(block.tool)} ${target}, show details`} hitSlop={{ top: 12, bottom: 12 }} onPress={() => onOpen(block)} style={styles.tool}>
      {body}
    </Pressable>
  );
}

function DiffView({ block }: { block: Extract<Block, { kind: 'edit' }> }) {
  const [all, setAll] = useState(false);
  const { lines, added, removed, hidden } = useMemo(() => parseDiff(block.diff, block.change), [block.diff, block.change]);
  const shown = all ? lines : lines.slice(0, DIFF_PREVIEW);
  return (
    <View style={styles.diff}>
      <View style={styles.diffHead}>
        <Text style={[type.mono, styles.diffPath]} numberOfLines={1}>
          {block.path}
        </Text>
        <Text style={[type.mono, styles.added]}>+{added}</Text>
        <Text style={[type.mono, styles.removed]}>−{removed}</Text>
      </View>
      {shown.map((line, index) => (
        <View key={index} style={[styles.diffRow, line.kind === 'add' && styles.addRow, line.kind === 'del' && styles.delRow]}>
          <Text style={[type.mono, styles.lineNo]}>{line.kind === 'hunk' ? '' : line.line}</Text>
          <Text style={[styles.diffText, line.kind === 'hunk' && styles.hunk, line.kind === 'add' && styles.added, line.kind === 'del' && styles.removed]} selectable>
            {line.kind === 'add' ? '+ ' : line.kind === 'del' ? '− ' : line.kind === 'ctx' ? '  ' : ''}
            {line.text}
          </Text>
        </View>
      ))}
      {lines.length > DIFF_PREVIEW && !all ? (
        <Pressable accessibilityRole="button" hitSlop={{ top: 12, bottom: 12 }} onPress={() => setAll(true)}>
          <Text style={[type.captionStrong, styles.more]}>Show {hidden > 0 ? `the first ${MAX_DIFF_LINES}` : `all ${lines.length}`} lines</Text>
        </Pressable>
      ) : null}
      {all && hidden > 0 ? <Text style={[type.caption, styles.more]}>{hidden} more lines are on the desktop</Text> : null}
    </View>
  );
}

function PlanView({ block }: { block: Extract<Block, { kind: 'plan' }> }) {
  return (
    <View style={styles.plan}>
      <Text style={type.caption}>{planDone(block.items)}</Text>
      {block.items.map((item, index) => (
        <View key={index} style={styles.planItem}>
          <View style={[styles.mark, item.status === 'done' && styles.markDone, item.status === 'active' && styles.markActive]}>
            {item.status === 'done' ? <Check size={10} color={colors.bg} strokeWidth={3} /> : null}
          </View>
          <Text style={[type.bodyMuted, styles.planText, item.status === 'active' && { color: colors.fg }, item.status === 'done' && styles.planDone]}>{item.text}</Text>
        </View>
      ))}
    </View>
  );
}

function Clipped({ text, style }: { text: string; style?: object }) {
  const clipped = useMemo(() => clipHead(text), [text]);
  return (
    <Text style={style} selectable>
      {clipped.text}
      {clipped.hidden > 0 ? `\n… ${clipped.hidden} more characters are on the desktop` : ''}
    </Text>
  );
}

const BlockView = memo(function BlockView({ block, onOpen }: { block: Block; onOpen: (block: ToolBlock) => void }) {
  if (block.kind === 'text') return <Clipped text={block.text} style={[type.body, styles.text]} />;
  if (block.kind === 'tool') return <ToolLine block={block} onOpen={onOpen} />;
  if (block.kind === 'edit') return <DiffView block={block} />;
  return <PlanView block={block} />;
});

function WorkingLine({ startedAt }: { startedAt?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (startedAt === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return (
    <View style={styles.working}>
      <ActivityIndicator size="small" color={colors.brand} />
      <Text style={[type.caption, styles.workingText]}>{workingFor(startedAt, now)}</Text>
    </View>
  );
}

export const TurnView = memo(function TurnView({ turn, onOpen }: { turn: Turn; onOpen: (block: ToolBlock) => void }) {
  return (
    <View style={styles.turn}>
      {turn.prompt ? (
        <View style={styles.prompt}>
          <Clipped text={turn.prompt.text} style={type.body} />
        </View>
      ) : null}
      {visibleBlocks(turn).map((block) => (
        <BlockView key={`${block.kind}:${block.id}`} block={block} onOpen={onOpen} />
      ))}
      {turn.status === 'running' ? (
        <WorkingLine startedAt={turn.startedAt} />
      ) : turn.status !== 'done' ? (
        <Text style={[type.caption, styles.dim]}>{turn.status === 'interrupted' ? 'Interrupted' : 'Failed'}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  turn: { gap: space.md },
  prompt: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceHigh,
  },
  text: { lineHeight: 23 },
  tool: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  verb: { width: 72 },
  target: { flexShrink: 1, color: colors.fg },
  failed: { color: colors.attn },
  diff: { borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: colors.bgSunken, paddingVertical: space.sm, overflow: 'hidden' },
  diffHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm },
  diffPath: { flex: 1, color: colors.fg },
  diffRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md },
  addRow: { backgroundColor: 'rgba(95, 205, 140, 0.12)' },
  delRow: { backgroundColor: colors.attnSoft },
  lineNo: { width: 28, textAlign: 'right', color: colors.dim },
  diffText: { flex: 1, fontFamily: font.mono, fontSize: 12, lineHeight: 17, color: colors.muted },
  hunk: { color: colors.dim },
  added: { color: '#5fcd8c' },
  removed: { color: colors.attn },
  more: { color: colors.brand, paddingHorizontal: space.md, paddingTop: space.sm },
  plan: { gap: space.sm },
  planItem: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  planText: { flex: 1 },
  planDone: { color: colors.dim },
  mark: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.dim, alignItems: 'center', justifyContent: 'center' },
  markDone: { backgroundColor: colors.dim },
  markActive: { borderColor: colors.brand },
  working: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  workingText: { color: colors.brand },
  dim: { color: colors.dim },
});
