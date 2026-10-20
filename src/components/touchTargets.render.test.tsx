import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Search } from 'lucide-react-native';
import type { Ask } from '../model/asks';
import { touch } from '../theme';
import { AskCard } from './AskCard';
import { AskHeadsUp } from './AskHeadsUp';
import { ChatSwitch } from './ChatSwitch';
import { Button, IconButton, ListRow, Segmented } from './ui';

function size(element: { props: { style?: unknown; hitSlop?: unknown } }): number {
  const style = Object.assign({}, ...[element.props.style].flat(Infinity).filter(Boolean)) as { minHeight?: number; height?: number };
  const slop = element.props.hitSlop;
  const extra = typeof slop === 'number' ? slop * 2 : slop && typeof slop === 'object' ? ((slop as { top?: number }).top ?? 0) + ((slop as { bottom?: number }).bottom ?? 0) : 0;
  return Math.max(style.minHeight ?? 0, style.height ?? 0) + extra;
}

const ASK: Ask = {
  askId: 'a',
  sessionId: 's',
  paneId: 'p',
  kind: 'question',
  agent: 'claude',
  title: 'Which environment?',
  choices: [
    { id: 'staging', label: 'Staging', tone: 'neutral' },
    { id: 'production', label: 'Production', tone: 'neutral' },
  ],
  allowText: true,
  since: Date.now(),
};

test('PHA-C30 every control reaches the 48 dp touch size, by its height or its hit slop', async () => {
  const noop = jest.fn();
  await render(
    <>
      <Button label="Regular" onPress={noop} />
      <Button label="Compact" compact onPress={noop} />
      <IconButton icon={Search} label="plain" onPress={noop} />
      <IconButton icon={Search} label="tonal" variant="tonal" onPress={noop} />
      <IconButton icon={Search} label="filled" variant="filled" onPress={noop} />
      <Segmented label="mode" options={[{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }]} value="a" onChange={noop} />
      <ChatSwitch value="chat" onChange={noop} />
      <ListRow title="Row" onPress={noop} />
      <AskHeadsUp ask={ASK} onOpen={noop} />
      <AskCard ask={ASK} workspace="w" canRespond onAnswer={noop} compact onReply={noop} />
    </>,
  );
  const buttons = [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')];
  expect(buttons.length).toBeGreaterThanOrEqual(14);
  const small = buttons.filter((button: (typeof buttons)[number]) => size(button) < touch).map((button: (typeof buttons)[number]) => String(button.props.accessibilityLabel ?? button.props.accessibilityRole));
  expect(small).toEqual([]);
});

test('PHA-C31 a button label wraps instead of cutting a long answer short', async () => {
  await render(<Button label="Production environment" onPress={jest.fn()} />);
  expect(screen.getByText('Production environment').props.numberOfLines).toBeUndefined();
});
