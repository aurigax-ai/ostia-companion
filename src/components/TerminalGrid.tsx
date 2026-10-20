import React, { useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PixelRatio, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { DEFAULT_BG, DEFAULT_FG, Line, TerminalCopy } from '../model/terminalCopy';
import {
  Box,
  LINE_HEIGHT,
  MONO_ADVANCE,
  Offset,
  clampOffset,
  clampZoom,
  fitToBox,
  fitToWidth,
  gridBox,
  zoomAbout,
} from '../model/terminalFit';
import { colors, font } from '../theme';

const ORIGIN: Offset = { x: 0, y: 0 };
const ROW_SLACK = 6;

export function TerminalGrid({ copy, version, fit: fitMode = 'width' }: { copy: TerminalCopy; version: number; fit?: 'width' | 'box' }) {
  const [view, setView] = useState<Box>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>(ORIGIN);
  const start = useRef({ zoom: 1, offset: ORIGIN });
  const scale = 1 / PixelRatio.getFontScale();

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setView({ width, height });
  };

  const fit = fitMode === 'box' ? fitToBox(copy.cols, copy.rows, view) : fitToWidth(copy.cols, view.width);
  const fontSize = fit * zoom;
  const content = gridBox(copy.cols, copy.rows, fontSize);
  const shown = clampOffset(offset, content, view);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(8)
    .onBegin(() => (start.current.offset = shown))
    .onUpdate((event) => {
      setOffset(clampOffset({ x: start.current.offset.x + event.translationX, y: start.current.offset.y + event.translationY }, content, view));
    });

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => (start.current = { zoom, offset: shown }))
    .onUpdate((event) => {
      const next = clampZoom(start.current.zoom * event.scale);
      const ratio = next / start.current.zoom;
      const moved = zoomAbout(start.current.offset, { x: event.focalX, y: event.focalY }, ratio);
      setZoom(next);
      setOffset(clampOffset(moved, gridBox(copy.cols, copy.rows, fit * next), view));
    });

  const cursor = copy.cursor();
  const cell = { width: MONO_ADVANCE * fontSize, height: LINE_HEIGHT * fontSize };
  const lines = copy.screen();
  void version;

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
      <View style={styles.fill} onLayout={onLayout} testID="terminal-grid">
        <Animated.View style={[styles.grid, { width: content.width, height: content.height, transform: [{ translateX: shown.x }, { translateY: shown.y }] }]}>
          {lines.map((line, y) => (
            <Row key={y} line={line} fontSize={fontSize * scale} lineHeight={cell.height * scale} width={content.width + ROW_SLACK} />
          ))}
          <View
            pointerEvents="none"
            style={[styles.cursor, { left: cursor.x * cell.width, top: cursor.y * cell.height, width: cell.width, height: cell.height }]}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function Row({ line, fontSize, lineHeight, width }: { line: Line; fontSize: number; lineHeight: number; width: number }) {
  return (
    <Text testID="grid-row" numberOfLines={1} ellipsizeMode="clip" style={{ width, fontFamily: font.mono, fontSize, lineHeight, color: DEFAULT_FG }}>
      {line.length === 0 ? ' ' : null}
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
    </Text>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: DEFAULT_BG, overflow: 'hidden' },
  grid: { position: 'absolute', top: 0, left: 0 },
  cursor: { position: 'absolute', backgroundColor: colors.brand, opacity: 0.55 },
});
