import { describe, expect, it } from 'vitest';
import { failureText, isActive, startBlock, stoppedText, timeLeft } from './phoneSession';

describe('phone session model', () => {
  it('blocks a start on an unsupported phone, while one runs, and when offline, in that order', () => {
    expect(startBlock({ supported: false, connected: true, active: false })).toBe('unsupported');
    expect(startBlock({ supported: true, connected: false, active: true })).toBe('running');
    expect(startBlock({ supported: true, connected: false, active: false })).toBe('offline');
    expect(startBlock({ supported: true, connected: true, active: false })).toBeNull();
  });

  it('counts starting, running and paused as active', () => {
    expect(['idle', 'starting', 'running', 'paused', 'stopped'].map(isActive)).toEqual([false, true, true, true, false]);
  });

  it('shows the time left in minutes and seconds, never below zero', () => {
    expect(timeLeft(761_000, 0)).toBe('12:41 left');
    expect(timeLeft(0, 5_000)).toBe('0:00 left');
  });

  it('PHC-C8 words a desktop before v1.8 as needing an update', () => {
    expect(stoppedText('desktop-too-old')).toBe('Update Ostia on the desktop to share this phone.');
    expect(stoppedText('something-new')).toBe('The session ended.');
  });

  it('PHC-C2 says nothing was sent when the capture prompt is cancelled', () => {
    expect(failureText('cancelled')).toBe('Not started. Nothing was sent to the desktop.');
  });
});
