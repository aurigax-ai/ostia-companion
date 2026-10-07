import { sha256 } from '@noble/hashes/sha2.js';
import { describe, expect, it } from 'vitest';
import app from '../../app.json';
import { desktopFromService, nearbyState, SEARCH_MS } from './discovery';
import { checkCode } from './pairCheck';
import { codeProblem, normalizeCode } from './pairCode';
import { pairFailure } from './pairFailure';
import { requestPairing } from './pairFlow';

const VECTOR_FINGERPRINT = 'sha256/q83vEjRWeJCrze8SNFZ4kKvN7xI0VniQq83vEjRWeJA=';
const VECTOR_PUBKEY = 'MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=';

function service(txt: Record<string, string>) {
  return { name: 'xps', fullName: 'xps._ostia._tcp.local.', host: 'xps.local.', port: 8722, addresses: [], ipv4: [], ipv6: [], txt };
}

const TXT = { v: '1', name: 'xps15-9530', host: '100.64.1.2', port: '8722', fp: 'sha256/x' };

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('code pairing', () => {
  it('CPD-C7 accepts the code in lowercase, with a space or with the dash', () => {
    expect(normalizeCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeCode('abcd efgh')).toBe('ABCDEFGH');
    expect(normalizeCode('ABCDEFGH')).toBe('ABCDEFGH');
  });

  it('CPD-C8 refuses a code that is short or holds O, 0, I or 1, and says what a code looks like', () => {
    for (const input of ['ABCDEFG', 'ABCDEFGO', 'ABCDEFG0', 'ABCDEFGI', 'ABCDEFG1']) {
      expect(normalizeCode(input)).toBeNull();
      expect(codeProblem(input)).toBe('The code is 8 letters and digits from the desktop, like ABCD-EFGH.');
    }
    expect(codeProblem('')).toBeNull();
    expect(codeProblem('abcd-efgh')).toBeNull();
  });

  it('CPD-C18 computes the contract test vector', () => {
    expect(checkCode(VECTOR_FINGERPRINT, VECTOR_PUBKEY, new Uint8Array(32).fill(1), new Uint8Array(32).fill(2))).toBe(
      '396848',
    );
  });

  it('CPD-C11 lists a valid announcement by the desktop name', () => {
    expect(desktopFromService(service(TXT))).toEqual({
      name: 'xps15-9530',
      host: '100.64.1.2',
      port: 8722,
      fingerprint: 'sha256/x',
    });
  });

  it('CPD-C12 drops announcements without a fingerprint, of another version or with a hostname', () => {
    const { fp: _fp, ...noFingerprint } = TXT;
    expect(desktopFromService(service(noFingerprint))).toBeNull();
    expect(desktopFromService(service({ ...TXT, v: '2' }))).toBeNull();
    expect(desktopFromService(service({ ...TXT, host: 'xps.local' }))).toBeNull();
    expect(desktopFromService(service({ ...TXT, port: 'eighty' }))).toBeNull();
  });

  it('CPD-C22 offers the QR and the link when no desktop was found', () => {
    expect(nearbyState([], SEARCH_MS - 1)).toEqual({ kind: 'searching' });
    expect(nearbyState([], SEARCH_MS)).toEqual({ kind: 'none', offers: ['scan-qr', 'paste-link'] });
  });

  it('CPD-C13 shows the same check code the desktop computes and pairs after approval', async () => {
    const desktopNonce = new Uint8Array(32).fill(7);
    const calls: { path: string; body: any }[] = [];
    const shown: string[] = [];
    let revealed: Uint8Array | null = null;
    const post = async (path: string, body: any) => {
      calls.push({ path, body });
      if (path === '/pair') return { requestId: 'r1', nonce: toBase64(desktopNonce) };
      revealed = fromBase64(body.nonce);
      return { deviceId: 'dev_1', deviceToken: 'tok', caps: ['read'], expiresAt: null };
    };
    const result = await requestPairing(
      post,
      { pairCode: 'ABCDEFGH', fingerprint: 'sha256/desk', deviceName: 'Pixel 9', pubkey: 'pk-phone' },
      (code) => shown.push(code),
    );
    expect(calls.map((c) => c.path)).toEqual(['/pair', '/pair/confirm']);
    expect(calls[0].body).toMatchObject({ pairCode: 'ABCDEFGH', device: { name: 'Pixel 9', pubkey: 'pk-phone' } });
    expect(calls[0].body.commit).toBe(toHex(sha256(revealed!)));
    expect(shown).toEqual([checkCode('sha256/desk', 'pk-phone', revealed!, desktopNonce)]);
    expect(result).toEqual({ deviceId: 'dev_1', deviceToken: 'tok', caps: ['read'], expiresAt: null });
  });

  it('CPD-C14 says the desktop declined', () => {
    expect(pairFailure('HTTP status code: 403', '100.64.1.2', 8722).text).toBe('The desktop declined this phone.');
    expect(pairFailure('HTTP error code: 403', '100.64.1.2', 8722).text).toBe('The desktop declined this phone.');
  });

  it('CPD-C21 says pairing expired when nobody approved in time', () => {
    expect(pairFailure('HTTP status code: 408', '100.64.1.2', 8722).text).toBe(
      'Pairing expired before the desktop approved it. Show a new code on the desktop and try again.',
    );
  });

  it('CPD-C24 declares the Bonjour service and local network use for iOS', () => {
    const plist = app.expo.ios.infoPlist;
    expect(plist.NSBonjourServices).toContain('_ostia._tcp');
    expect(typeof plist.NSLocalNetworkUsageDescription).toBe('string');
    expect(plist.NSLocalNetworkUsageDescription.length).toBeGreaterThan(0);
  });
});
