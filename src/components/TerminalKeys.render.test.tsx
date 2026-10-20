import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { touch } from '../theme';
import { KeyBar } from './TerminalKeys';

const flat = (element: { props: { style?: unknown } }) => Object.assign({}, ...[element.props.style].flat(Infinity).filter(Boolean)) as Record<string, number | string>;

function bar(compact: boolean) {
  return render(<KeyBar state={{ ctrl: false }} onEvent={jest.fn()} bottomInset={24} compact={compact} onKeyboard={jest.fn()} />);
}

test('PHV-C4 the landscape key bar has normal keys that do not stretch across the screen, and no big gap below', async () => {
  await bar(true);
  const key = screen.getByLabelText('esc');
  expect(flat(key).maxWidth).toBe(72);
  expect(flat(key).height).toBeLessThanOrEqual(32);
  expect((key.props.hitSlop as { top: number }).top * 2 + (flat(key).height as number)).toBeGreaterThanOrEqual(touch);
  const row = flat(key.parent!);
  expect(row.justifyContent).toBe('center');
  expect(row.paddingBottom).toBe(4 + 12);
});

test('PHV-C4 the portrait key bar keeps its full width and its inset', async () => {
  await bar(false);
  const key = screen.getByLabelText('esc');
  expect(flat(key).maxWidth).toBeUndefined();
  expect(flat(key.parent!).paddingBottom).toBe(8 + 24);
});
