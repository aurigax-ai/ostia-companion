import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Search } from 'lucide-react-native';
import type { Ask } from '../model/asks';
import { AskCard } from './AskCard';
import { Button, IconButton } from './ui';

function visual(element: { props: { style?: unknown } }): { minHeight: number; height: number } {
  const style = Object.assign({}, ...[element.props.style].flat(Infinity).filter(Boolean)) as { minHeight?: number; height?: number };
  return { minHeight: style.minHeight ?? 0, height: style.height ?? 0 };
}

const ASK: Ask = {
  askId: 'a',
  sessionId: 's',
  paneId: 'p',
  kind: 'permission',
  agent: 'claude',
  title: 'Run git push?',
  choices: [
    { id: 'deny', label: 'Deny', tone: 'deny' },
    { id: 'session', label: 'Allow for this session', tone: 'neutral' },
    { id: 'allow', label: 'Allow', tone: 'approve' },
  ],
  allowText: false,
  since: Date.now(),
};

test('CRD-C50 buttons are small to the eye: no button draws taller than 36 dp', async () => {
  const noop = jest.fn();
  await render(
    <>
      <Button label="Regular" onPress={noop} />
      <Button label="Compact" compact onPress={noop} />
      <IconButton icon={Search} label="plain" onPress={noop} />
      <IconButton icon={Search} label="filled" variant="filled" onPress={noop} />
    </>,
  );
  const tall = screen.getAllByRole('button').map(visual).filter((size) => Math.max(size.minHeight, size.height) > 36);
  expect(tall).toEqual([]);
});

test('CRD-C51 the permission sheet answers with small buttons in one right-aligned row, none full width', async () => {
  await render(<AskCard ask={ASK} workspace="api" canRespond onAnswer={jest.fn()} flat />);
  const buttons = ['Deny', 'Allow for this session', 'Allow'].map((label) => screen.getByText(label).parent!.parent!);
  buttons.forEach((button) => {
    const size = visual(button as never);
    expect(Math.max(size.minHeight, size.height)).toBeLessThanOrEqual(30);
    const style = Object.assign({}, ...[(button as any).props.style].flat(Infinity).filter(Boolean)) as { flexBasis?: string; flexGrow?: number };
    expect(style.flexBasis).toBeUndefined();
    expect(style.flexGrow).toBeUndefined();
  });
});
