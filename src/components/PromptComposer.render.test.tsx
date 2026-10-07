import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { interruptAgent, promptAgent } from '../services/askStore';
import { PromptComposer } from './PromptComposer';

const mockCalls: [string, object][] = [];

jest.mock('../services/rpc', () => ({
  OstiaRpc: {
    call: async (method: string, params: object) => {
      mockCalls.push([method, params]);
      return { ok: true };
    },
    addStatusListener: () => () => {},
    addEventListener: () => () => {},
    getStatus: () => 'connected',
  },
}));

async function renderComposer() {
  mockCalls.length = 0;
  await render(
    <PromptComposer
      canRespond
      bottomInset={0}
      onPrompt={(text) => void promptAgent('p-agent', text)}
      onInterrupt={(key) => void interruptAgent('p-agent', key)}
      onKeyboard={jest.fn()}
    />,
  );
}

test('AGT-C11 sends the typed prompt to the agent and clears the box', async () => {
  await renderComposer();
  await fireEvent.changeText(screen.getByLabelText('Prompt'), 'add a test');
  await fireEvent.press(screen.getByLabelText('Send prompt'));
  expect(mockCalls).toEqual([['agent.prompt', { paneId: 'p-agent', text: 'add a test' }]]);
  expect(screen.getByLabelText('Prompt').props.value).toBe('');
});

test('AGT-C12 Interrupt sends esc and Stop sends ctrl-c', async () => {
  await renderComposer();
  await fireEvent.press(screen.getByText('Interrupt'));
  await fireEvent.press(screen.getByText('Stop'));
  expect(mockCalls).toEqual([
    ['agent.interrupt', { paneId: 'p-agent', key: 'esc' }],
    ['agent.interrupt', { paneId: 'p-agent', key: 'ctrl-c' }],
  ]);
});

test('AGT-C15 an empty prompt is not sent', async () => {
  await renderComposer();
  await fireEvent.changeText(screen.getByLabelText('Prompt'), '   ');
  await fireEvent.press(screen.getByLabelText('Send prompt'));
  expect(mockCalls).toEqual([]);
});
