import { describe, expect, it } from 'vitest';
import type { PairingData } from '../services/storage';
import { addDesktop, chooseDesktop, EMPTY_DESKTOPS, removeDesktop } from './desktops';

function desktop(deviceId: string, fingerprint = `sha256/${deviceId}`): PairingData {
  return {
    deviceToken: `tok-${deviceId}`,
    deviceId,
    pinnedFingerprint: fingerprint,
    desktopName: deviceId,
    gatewayHost: '192.168.1.20',
    gatewayPort: 8722,
    privateKey: 'priv',
    publicKey: 'pub',
  };
}

describe('desktop list', () => {
  it('DSK-C1 pairing a second desktop keeps the first and makes the second active', () => {
    const list = addDesktop(addDesktop(EMPTY_DESKTOPS, desktop('a')), desktop('b'));
    expect(list.desktops.map((d) => d.deviceId)).toEqual(['a', 'b']);
    expect(list.activeId).toBe('b');
  });

  it('DSK-C2 pairing the same desktop again replaces its entry', () => {
    const first = addDesktop(EMPTY_DESKTOPS, desktop('old', 'sha256/same'));
    const again = addDesktop(addDesktop(first, desktop('x')), desktop('new', 'sha256/same'));
    expect(again.desktops.map((d) => d.deviceId)).toEqual(['x', 'new']);
    expect(again.activeId).toBe('new');
  });

  it('DSK-C3 choosing the other desktop makes it active and keeps both', () => {
    const list = chooseDesktop(addDesktop(addDesktop(EMPTY_DESKTOPS, desktop('a')), desktop('b')), 'a');
    expect(list.activeId).toBe('a');
    expect(list.desktops).toHaveLength(2);
  });

  it('DSK-C4 choosing an id that is not in the list changes nothing', () => {
    const list = addDesktop(addDesktop(EMPTY_DESKTOPS, desktop('a')), desktop('b'));
    expect(chooseDesktop(list, 'zzz')).toBe(list);
  });

  it('DSK-C5 removing the active desktop makes the other active', () => {
    const list = removeDesktop(addDesktop(addDesktop(EMPTY_DESKTOPS, desktop('a')), desktop('b')), 'b');
    expect(list.desktops.map((d) => d.deviceId)).toEqual(['a']);
    expect(list.activeId).toBe('a');
  });

  it('DSK-C6 removing the only desktop leaves none active', () => {
    const list = removeDesktop(addDesktop(EMPTY_DESKTOPS, desktop('a')), 'a');
    expect(list).toEqual({ desktops: [], activeId: null });
  });
});
