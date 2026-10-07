import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { FilesScreen } from './FilesScreen';

const mockReply: { value: unknown; fail: boolean } = { value: null, fail: false };

jest.mock('../services/rpc', () => ({
  OstiaRpc: {
    call: async () => {
      if (mockReply.fail) throw mockReply.value;
      return mockReply.value;
    },
  },
}));

async function renderFiles() {
  await render(
    <FilesScreen
      navigation={{ setOptions: jest.fn(), push: jest.fn(), navigate: jest.fn() } as any}
      route={{ key: 'Files', name: 'Files', params: { sessionId: 's', path: 'docs', title: 'docs' } } as any}
    />,
  );
}

test('FIL-C9 says an empty folder is empty', async () => {
  mockReply.fail = false;
  mockReply.value = { entries: [] };
  await renderFiles();
  expect(await screen.findByText('This folder is empty.')).toBeTruthy();
});

test('FIL-C8 says a desktop without file support cannot share files yet', async () => {
  mockReply.fail = true;
  mockReply.value = { code: -32601, message: 'method not found' };
  await renderFiles();
  expect(await screen.findByText(/This desktop can't share files yet/)).toBeTruthy();
});
