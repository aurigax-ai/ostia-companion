import { expect, jest, test } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PairingScreen } from './PairingScreen';

jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));
jest.mock('../services/useNearbyDesktops', () => ({
  useNearbyDesktops: () => ({ desktops: [], state: { kind: 'none', offers: ['scan-qr', 'paste-link'] } }),
}));
jest.mock('../services/pairWith', () => ({ pairWith: jest.fn() }));

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function renderScreen() {
  const navigation = { navigate: jest.fn() } as any;
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <PairingScreen navigation={navigation} route={{ key: 'Pair', name: 'Pair' } as any} onPaired={jest.fn(async () => {})} />
    </SafeAreaProvider>,
  );
  return navigation;
}

test('CRD-C29 the pairing start screen says where the code is, offers scan and paste, and never names Tailscale', async () => {
  await renderScreen();
  expect(screen.getByText(/On the desktop, open.*Settings › Remote.*show a pairing code/)).toBeTruthy();
  expect(screen.getByText('Scan QR code')).toBeTruthy();
  expect(screen.getByText('Paste a pairing link')).toBeTruthy();
  expect(screen.getByText(/None found/)).toBeTruthy();
  expect(screen.queryByText(/Tailscale/i)).toBeNull();
  expect(screen.queryByText(/^\d\.|Step \d/)).toBeNull();
});
