import { describe, expect, it } from 'vitest';
import {
  hashToken,
  needsRegistration,
  nextBackoff,
  parsePushConfig,
  parseRetryAfter,
  platformFor,
  pushLine,
  registerOutcome,
  retryDelay,
  sameOrigin,
} from './push';

describe('push configuration (contract v1.14 §3)', () => {
  it('PSH-M1 reads an https server and keeps only its origin', () => {
    expect(parsePushConfig({ server: 'https://api.example.com' })).toEqual({ server: 'https://api.example.com' });
    expect(parsePushConfig({ server: 'https://api.example.com/v1/' })).toEqual({ server: 'https://api.example.com' });
  });

  it('PSH-M7 reads registered only when it is a boolean', () => {
    expect(parsePushConfig({ server: 'https://a.b', registered: false })).toEqual({ server: 'https://a.b', registered: false });
    expect(parsePushConfig({ server: 'https://a.b', registered: true })).toEqual({ server: 'https://a.b', registered: true });
    expect(parsePushConfig({ server: 'https://a.b', registered: 'yes' })).toEqual({ server: 'https://a.b' });
  });

  it('PSH-M2 reads nothing from an absent, null or malformed push, or a server that is not https', () => {
    expect(parsePushConfig(undefined)).toBeNull();
    expect(parsePushConfig({ server: null })).toBeNull();
    expect(parsePushConfig({ server: 'http://api.example.com' })).toBeNull();
    expect(parsePushConfig({ server: 'not a url' })).toBeNull();
    expect(parsePushConfig('https://api.example.com')).toBeNull();
  });

  it('PSH-M3 maps the platform token type to the register platform', () => {
    expect(platformFor('android')).toBe('fcm');
    expect(platformFor('ios')).toBe('apns');
    expect(platformFor('web')).toBeNull();
  });

  it('PSH-M4 tells the registration answers apart', () => {
    expect(registerOutcome(201, { handle: 'h' })).toEqual({ handle: 'h' });
    expect(registerOutcome(201, {})).toBe('rejected');
    expect(registerOutcome(403, {})).toBe('ticket');
    expect(registerOutcome(429, null)).toEqual({ retryAfterMs: null });
    expect(registerOutcome(429, null, '7')).toEqual({ retryAfterMs: 7000 });
    expect(registerOutcome(503, null)).toBe('busy');
    expect(registerOutcome(500, null)).toEqual({ retryAfterMs: null });
    expect(registerOutcome(400, null)).toBe('rejected');
    expect(registerOutcome(302, null)).toBe('rejected');
  });

  it('PSH-M5 doubles the backoff up to a ceiling', () => {
    expect(nextBackoff(0)).toBe(30000);
    expect(nextBackoff(30000)).toBe(60000);
    expect(nextBackoff(600000)).toBe(600000);
  });

  it('PSH-M6 words the Settings line', () => {
    expect(pushLine({ server: null, state: 'off' })).toBe('Off');
    expect(pushLine({ server: 'https://a.b', state: 'on' })).toBe('On');
    expect(pushLine({ server: 'https://a.b', state: 'unavailable' })).toBe('Unavailable (build)');
    expect(pushLine({ server: 'https://a.b', state: 'refused' })).toBe('Refused by the server');
    expect(pushLine({ server: 'https://a.b', state: 'busy' })).toBe('Server is full');
    expect(pushLine({ server: 'https://a.b', state: 'notAllowed' })).toBe('Off: notifications not allowed');
    expect(pushLine({ server: 'https://a.b', state: 'registering' })).toBe('Setting up');
  });

  it('PSH-M8 reads Retry-After seconds and uses them instead of the backoff, up to the ceiling', () => {
    expect(parseRetryAfter('12')).toBe(12000);
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
    expect(retryDelay(60000, 5000)).toBe(5000);
    expect(retryDelay(60000, null)).toBe(120000);
    expect(retryDelay(0, 99999999)).toBe(600000);
  });

  it('PSH-M9 registers when there is no handle, the server or token changed, or the desktop says so', () => {
    const stored = { server: 'https://a.b', handle: 'h', tokenHash: hashToken('t') };
    const config = { server: 'https://a.b', registered: true };
    expect(needsRegistration(stored, config, hashToken('t'))).toBe(false);
    expect(needsRegistration(undefined, config, hashToken('t'))).toBe(true);
    expect(needsRegistration(stored, { server: 'https://c.d' }, hashToken('t'))).toBe(true);
    expect(needsRegistration(stored, config, hashToken('u'))).toBe(true);
    expect(needsRegistration(stored, { ...config, registered: false }, hashToken('t'))).toBe(true);
    expect(needsRegistration(stored, { server: 'https://a.b' }, hashToken('t'))).toBe(false);
  });

  it('PSH-M10 accepts an answer from the same origin or with no url, and refuses another origin', () => {
    expect(sameOrigin('https://api.example.com/v1/push/register', 'https://api.example.com')).toBe(true);
    expect(sameOrigin(undefined, 'https://api.example.com')).toBe(true);
    expect(sameOrigin('https://evil.example.net/x', 'https://api.example.com')).toBe(false);
    expect(sameOrigin('http://api.example.com/x', 'https://api.example.com')).toBe(false);
  });
});
