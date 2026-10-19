import { describe, expect, it } from 'vitest';
import { endedLine, failureText, isActive, pausedText, stoppedText, timeLeft } from './phoneSession';

describe('phone session model', () => {
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

  it('PHC-C9 says why the agent is paused', () => {
    expect(pausedText('human-touch')).toBe('Paused because you touched the screen');
    expect(pausedText(null)).toBe('Paused');
  });

  it('PHA-C21 says in one short line why phone control ended', () => {
    expect(endedLine('time-limit')).toBe('Phone control ended · time limit');
    expect(endedLine('stop-desktop')).toBe('Phone control ended · stopped on the desktop');
    expect(endedLine('unreachable')).toBe('Phone control ended · connection closed');
  });
});
