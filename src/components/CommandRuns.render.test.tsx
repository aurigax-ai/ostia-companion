import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { FlatList } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { CommandRun } from '../model/terminalCopy';
import { CommandRuns, PAGE_LINES } from './CommandRuns';

const lines = (n: number) => Array.from({ length: n }, (_, i) => [{ text: `line ${i}` }]);
const run = (id: number, output = lines(3), extra: Partial<CommandRun> = {}): CommandRun => ({
  id,
  command: `cmd ${id}`,
  exitCode: 0,
  running: false,
  fullscreen: false,
  trimmed: false,
  output,
  ...extra,
});

const scroll = (offset: number, content = 2000, view = 800) =>
  fireEvent.scroll(screen.getByTestId('commands-view'), {
    nativeEvent: { contentOffset: { x: 0, y: offset }, contentSize: { width: 360, height: content }, layoutMeasurement: { width: 360, height: view } },
  });

test('CRD-C70 a long run shows one page of lines, and each tap adds one more page instead of rendering everything', async () => {
  await render(<CommandRuns runs={[run(1, lines(1000))]} fontSize={12} onOpenFullscreen={jest.fn()} />);
  expect(screen.getByText('Show 200 earlier lines')).toBeTruthy();
  expect(screen.queryByText(/line 799\b/)).toBeNull();
  expect(screen.getByText(/line 999\b/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Show 200 earlier lines'));
  expect(screen.getByText(/line 600\b/)).toBeTruthy();
  expect(screen.queryByText(/line 599\b/)).toBeNull();
  expect(PAGE_LINES).toBe(200);
});

test('CRD-C71 a trimmed run says so and keeps its exit code', async () => {
  await render(<CommandRuns runs={[run(1, lines(5), { trimmed: true, exitCode: 3 })]} fontSize={12} onOpenFullscreen={jest.fn()} />);
  expect(screen.getByText('Earlier output trimmed')).toBeTruthy();
  expect(screen.getByText('exit 3')).toBeTruthy();
});

test('CRD-C72 new output follows only while the list is at the bottom', async () => {
  const toEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {});
  await render(<CommandRuns runs={[run(1)]} fontSize={12} onOpenFullscreen={jest.fn()} />);
  toEnd.mockClear();
  const grow = (height: number) => fireEvent(screen.getByTestId('commands-view'), 'contentSizeChange', 360, height);
  await act(async () => grow(1000));
  expect(toEnd).toHaveBeenCalledTimes(1);
  await act(async () => scroll(500, 2000));
  await act(async () => grow(1100));
  expect(toEnd).toHaveBeenCalledTimes(1);
  await act(async () => scroll(1190, 2000));
  await act(async () => grow(1200));
  expect(toEnd).toHaveBeenCalledTimes(2);
  toEnd.mockRestore();
});

test('CRD-C73 showing earlier lines keeps the reader where they were', async () => {
  const toOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
  jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {});
  await render(<CommandRuns runs={[run(1, lines(600))]} fontSize={12} onOpenFullscreen={jest.fn()} />);
  const size = (height: number) => fireEvent(screen.getByTestId('commands-view'), 'contentSizeChange', 360, height);
  await act(async () => size(9000));
  await act(async () => scroll(500, 9000, 800));
  await fireEvent.press(screen.getByText('Show 200 earlier lines'));
  await act(async () => size(12000));
  expect(toOffset).toHaveBeenCalledWith({ offset: 3500, animated: false });
  toOffset.mockRestore();
});
