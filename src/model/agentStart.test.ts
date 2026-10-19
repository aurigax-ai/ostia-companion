import { describe, expect, it } from 'vitest';
import { startFailureText } from './agentStart';

describe('agent start model', () => {
  it('names each refusal of agent.start the desktop sends', () => {
    expect(startFailureText({ code: -32602, message: 'unknown-session' })).toBe('That workspace is closed on the desktop.');
    expect(startFailureText({ code: -32602, message: 'refused' })).toBe('Agents cannot be started in this workspace.');
    expect(startFailureText({ code: -32602, message: 'bad-params' })).toMatch(/^The desktop does not start an agent from that message/);
    expect(startFailureText({ code: -32006, message: 'not-started' })).toMatch(/^The agent did not start/);
    expect(startFailureText({ code: -32007, message: 'rate-limited' })).toMatch(/^Wait a minute/);
    expect(startFailureText({ code: -32003, message: 'needs-elevation' })).toMatch(/Respond/);
  });

  it('asks for a desktop update when the desktop has no agent.start', () => {
    expect(startFailureText({ code: -32601, message: 'Method not found' })).toBe('Update Ostia on the desktop to start agents from this phone.');
  });

  it('says so when offline and falls back for anything else', () => {
    expect(startFailureText({ code: -1, message: 'Not connected to the desktop' })).toBe('Not connected to the desktop.');
    expect(startFailureText({ code: -32602, message: 'something new' })).toMatch(/^The desktop does not start an agent/);
    expect(startFailureText(undefined)).toBe('The agent could not start.');
  });
});
