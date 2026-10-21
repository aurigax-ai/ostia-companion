import { describe, expect, it } from 'vitest';
import { candidateTimeout, delayCap, nextDelay, nextScan, scanDue, timing } from './reconnectPolicy';

describe('reconnect policy', () => {
  it('RLY-T1 gives a relay candidate more than the 6 s the relay may hold a connection, and a direct one 5 s', () => {
    expect(candidateTimeout('relay')).toBeGreaterThanOrEqual(6000);
    expect(candidateTimeout('lan')).toBe(5000);
    expect(candidateTimeout(undefined)).toBe(5000);
  });

  it('RDS-B4 raises the retry cap after a full failed cycle, and keeps it low otherwise', () => {
    expect(delayCap(false)).toBe(timing.maxDelayMs);
    expect(delayCap(true)).toBe(timing.unreachableMaxDelayMs);
    expect(nextDelay(timing.maxDelayMs, delayCap(true))).toBe(timing.maxDelayMs * 2);
    expect(nextDelay(timing.unreachableMaxDelayMs, delayCap(true))).toBe(timing.unreachableMaxDelayMs);
  });

  it('RDS-B5 backs the LAN scan off on its own schedule, up to a ceiling', () => {
    let state = { scanAt: 0, scanDelay: timing.minScanDelayMs };
    expect(scanDue(1000, state.scanAt)).toBe(true);
    state = nextScan(1000, state.scanDelay);
    expect(scanDue(1000 + timing.minScanDelayMs - 1, state.scanAt)).toBe(false);
    expect(scanDue(1000 + timing.minScanDelayMs, state.scanAt)).toBe(true);
    for (let i = 0; i < 20; i++) state = nextScan(0, state.scanDelay);
    expect(state.scanDelay).toBe(timing.maxScanDelayMs);
  });
});
