import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PixelRatio, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { DEFAULT_BG, DEFAULT_FG, Line, Span, TerminalCopy } from '../model/terminalCopy';
import { Box, LINE_HEIGHT, MONO_ADVANCE, clampZoom, fitToBox, fitToWidth } from '../model/terminalFit';
import { colors, font, space } from '../theme';

const ROW_SLACK = 6;
export const GRID_PAD = space.md;
const BOTTOM_SLACK_LINES = 1;

function spanStyle(span: Span) {
  return {
    color: span.fg ?? DEFAULT_FG,
    backgroundColor: span.bg,
    fontFamily: span.bold ? font.monoSemibold : font.mono,
    opacity: span.dim ? 0.6 : 1,
    fontStyle: span.italic ? ('italic' as const) : ('normal' as const),
    textDecorationLine: span.underline && span.strike ? ('underline line-through' as const) : span.underline ? ('underline' as const) : span.strike ? ('line-through' as const) : ('none' as const),
  };
}

const PlainRows = memo(function PlainRows({ lines, fontSize, lineHeight, width }: { lines: Line[]; fontSize: number; lineHeight: number; width: number }) {
  return (
    <Text selectable testID="grid-text" style={{ width, fontFamily: font.mono, fontSize, lineHeight, color: DEFAULT_FG }}>
      {lines.map((line, y) => (
        <Text key={y}>
          {y > 0 ? '\n' : ''}
          {line.length === 0 ? ' ' : line.map((span, i) => <Text key={i} style={spanStyle(span)}>{span.text}</Text>)}
        </Text>
      ))}
    </Text>
  );
});

const PlacedRow = memo(function PlacedRow({ line, fontSize, lineHeight, rowHeight, cellWidth, width }: { line: Line; fontSize: number; lineHeight: number; rowHeight: number; cellWidth: number; width: number }) {
  return (
    <View style={{ width, height: rowHeight }} testID="grid-row">
      {line.map((span, i) => (
        <Text
          key={i}
          selectable
          numberOfLines={1}
          style={[{ position: 'absolute', left: (span.col ?? 0) * cellWidth, fontSize, lineHeight }, spanStyle(span)]}
        >
          {span.text}
        </Text>
      ))}
    </View>
  );
});

export function TerminalGrid({
  copy,
  version,
  fit: fitMode = 'width',
  onMeasure,
}: {
  copy: TerminalCopy;
  version: number;
  fit?: 'width' | 'box';
  onMeasure?: (box: Box) => void;
}) {
  const [view, setView] = useState<Box>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [top, setTop] = useState(0);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const scroll = useRef({ x: 0, y: 0 });
  const follow = useRef(true);
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const gestureStart = useRef({ x: 0, y: 0, zoom: 1 });
  const scale = 1 / PixelRatio.getFontScale();

  const onLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    const width = Math.max(0, event.nativeEvent.layout.width - 2 * GRID_PAD);
    setView({ width, height });
    onMeasure?.({ width, height });
  };

  const fit = fitMode === 'box' ? fitToBox(copy.cols, copy.rows, view) : fitToWidth(copy.cols, view.width);
  const fontSize = fit * zoom;
  const cellWidth = MONO_ADVANCE * fontSize;
  const lineHeight = LINE_HEIGHT * fontSize;
  const contentWidth = copy.cols * cellWidth;
  const total = copy.lineCount;
  const contentHeight = total * lineHeight;
  const maxX = Math.max(0, contentWidth - view.width);
  const maxY = Math.max(0, contentHeight - view.height);
  const rowsShown = Math.max(0, Math.min(Math.ceil(view.height / Math.max(lineHeight, 1)) + 2, total - top));
  const dims = useRef({ maxX, maxY, lineHeight, total });
  dims.current = { maxX, maxY, lineHeight, total };

  const apply = (x: number, y: number) => {
    const d = dims.current;
    scroll.current = { x: Math.min(d.maxX, Math.max(0, x)), y: Math.min(d.maxY, Math.max(0, y)) };
    follow.current = scroll.current.y >= d.maxY - d.lineHeight * BOTTOM_SLACK_LINES;
    const line = Math.floor(scroll.current.y / Math.max(d.lineHeight, 1));
    tx.setValue(-scroll.current.x);
    ty.setValue(-(scroll.current.y - line * d.lineHeight));
    setTop((current) => (current === line ? current : line));
  };

  useEffect(() => {
    if (follow.current) apply(scroll.current.x, maxY);
    else apply(scroll.current.x, scroll.current.y);
  }, [version, maxY, maxX, lineHeight]);

  const pan = Gesture.Pan()
    .withTestId('grid-pan')
    .runOnJS(true)
    .minDistance(8)
    .onBegin(() => (gestureStart.current = { ...scroll.current, zoom }))
    .onUpdate((event) => apply(gestureStart.current.x - event.translationX, gestureStart.current.y - event.translationY));

  const pinch = Gesture.Pinch()
    .withTestId('grid-pinch')
    .runOnJS(true)
    .onBegin((event) => {
      gestureStart.current = { ...scroll.current, zoom };
      setOrigin({ x: event.focalX - GRID_PAD, y: event.focalY });
    })
    .onUpdate((event) => pinchScale.setValue(clampZoom(gestureStart.current.zoom * event.scale) / gestureStart.current.zoom))
    .onEnd((event) => {
      const next = clampZoom(gestureStart.current.zoom * event.scale);
      const ratio = next / gestureStart.current.zoom;
      pinchScale.setValue(1);
      const focalX = event.focalX - GRID_PAD;
      const x = (gestureStart.current.x + focalX) * ratio - focalX;
      const y = (gestureStart.current.y + event.focalY) * ratio - event.focalY;
      setZoom(next);
      const nextFont = fit * next;
      const nextLine = LINE_HEIGHT * nextFont;
      dims.current = {
        maxX: Math.max(0, copy.cols * MONO_ADVANCE * nextFont - view.width),
        maxY: Math.max(0, total * nextLine - view.height),
        lineHeight: nextLine,
        total,
      };
      apply(x, y);
    });

  const lines = useMemo(() => copy.window(top, rowsShown), [copy, version, top, rowsShown, gridKey(copy)]);
  const hasWide = lines.some((line) => line.some((span) => span.wide));
  const cursor = copy.cursor();
  const cursorRow = cursor.y - top;
  const rowWidth = contentWidth + ROW_SLACK;

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
      <View style={styles.fill} onLayout={onLayout} testID="terminal-grid">
       <View style={styles.inner}>
        <Animated.View
          style={[
            styles.grid,
            {
              width: rowWidth,
              height: rowsShown * lineHeight,
              transformOrigin: `${origin.x}px ${origin.y}px`,
              transform: [{ translateX: tx }, { translateY: ty }, { scale: pinchScale }],
            },
          ]}
        >
          {hasWide ? (
            lines.map((line, y) => <PlacedRow key={top + y} line={line} fontSize={fontSize * scale} lineHeight={lineHeight * scale} rowHeight={lineHeight} cellWidth={cellWidth} width={rowWidth} />)
          ) : (
            <PlainRows lines={lines} fontSize={fontSize * scale} lineHeight={lineHeight * scale} width={rowWidth} />
          )}
          {cursorRow >= 0 && cursorRow < rowsShown ? (
            <View
              pointerEvents="none"
              style={[styles.cursor, { left: cursor.x * cellWidth, top: cursorRow * lineHeight, width: cellWidth, height: lineHeight }]}
            />
          ) : null}
        </Animated.View>
       </View>
      </View>
    </GestureDetector>
  );
}

function gridKey(copy: TerminalCopy): number {
  return copy.cols * 1000 + copy.rows;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: DEFAULT_BG, overflow: 'hidden' },
  inner: { flex: 1, marginHorizontal: GRID_PAD, overflow: 'hidden' },
  grid: { position: 'absolute', top: 0, left: 0 },
  cursor: { position: 'absolute', backgroundColor: colors.brand, opacity: 0.55 },
});
