import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { TerminalCopy } from '../model/terminalCopy';
import { TerminalGrid } from './TerminalGrid';

const bytes = (text: string) => unescape(encodeURIComponent(text));

async function grid(text: string, cols = 40, rows = 10) {
  const copy = new TerminalCopy(cols, rows);
  await copy.write(bytes(text));
  await render(<TerminalGrid copy={copy} version={1} />);
  await act(async () =>
    fireEvent(screen.getByTestId('terminal-grid'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 300 } } }),
  );
  return copy;
}

const many = Array.from({ length: 300 }, (_, i) => `row ${i}`).join('\r\n');

test('CRD-C80 the Terminal view opens at the bottom and a drag scrolls back through the scrollback, not only the viewport', async () => {
  await grid(many);
  expect(screen.getByText(/row 299/)).toBeTruthy();
  expect(screen.queryByText(/row 100\b/)).toBeNull();
  await act(async () => fireGestureHandler(getByGestureTestId('grid-pan'), [{ translationY: 0 }, { translationY: 3000 }, { translationY: 3000, state: 5 }]));
  expect(screen.queryByText(/row 299/)).toBeNull();
  expect(screen.getAllByText(/row 1[45]\d\b/).length).toBeGreaterThan(5);
});

test('CRD-C81 the text is selectable for copying, as one block of rows', async () => {
  await grid('hello\r\nworld');
  expect(screen.getByTestId('grid-text').props.selectable).toBe(true);
});

test('CRD-C82 a row with wide characters is placed cell by cell, so later text does not drift', async () => {
  await grid('\x1b[2J\x1b[H你好ab');
  const rows = screen.getAllByTestId('grid-row');
  expect(rows.length).toBeGreaterThan(0);
  expect(screen.getByText('你')).toBeTruthy();
  const second = screen.getByText('好');
  const flat = Object.assign({}, ...[second.props.style].flat(Infinity).filter(Boolean)) as { left: number };
  const first = Object.assign({}, ...[screen.getByText('你').props.style].flat(Infinity).filter(Boolean)) as { left: number };
  expect(flat.left - first.left).toBeCloseTo(2 * 0.6 * (360 / (40 * 0.6)) * 1, 0);
});

test('CRD-C83 dragging within a line does not read the screen again', async () => {
  const copy = new TerminalCopy(40, 10);
  await copy.write(bytes(many));
  const window = jest.spyOn(copy, 'window');
  await render(<TerminalGrid copy={copy} version={1} />);
  await act(async () =>
    fireEvent(screen.getByTestId('terminal-grid'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 300 } } }),
  );
  window.mockClear();
  await act(async () => fireGestureHandler(getByGestureTestId('grid-pan'), [{ translationY: 0 }, { translationY: 2 }, { translationY: 4 }, { translationY: 4, state: 5 }]));
  expect(window).not.toHaveBeenCalled();
});
