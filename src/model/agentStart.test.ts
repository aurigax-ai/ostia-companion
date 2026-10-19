import { describe, expect, it } from 'vitest';
import { chatTarget, parsePhoneWorkspace, startFailureText } from './agentStart';

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

describe('new chat target', () => {
  const sessions = [
    { sessionId: 's-scratch', kind: 'scratch' },
    { sessionId: 's-term', kind: 'terminal' },
    { sessionId: 's-agent', kind: 'agent' },
  ];
  const id = (target: ReturnType<typeof chatTarget>) => (target?.kind === 'workspace' ? target.session.sessionId : target?.kind ?? null);

  it('PHA-C8 aims at the workspace asked for, else the last one used, else the first agent workspace', () => {
    expect(id(chatTarget(sessions, { kind: 'workspace', sessionId: 's-term' }, 's-agent', null))).toBe('s-term');
    expect(id(chatTarget(sessions, undefined, 's-term', null))).toBe('s-term');
    expect(id(chatTarget(sessions, undefined, 's-scratch', null))).toBe('s-agent');
    expect(id(chatTarget(sessions, undefined, null, null))).toBe('s-agent');
    expect(chatTarget([], undefined, null, null)).toBeNull();
  });

  it('PHA-C8 starts in the Phone workspace when the desktop has one, unless a workspace is asked for', () => {
    const phone = { set: true, agent: 'claude' as const };
    const withPhone = [...sessions, { sessionId: 's-phone', kind: 'agent', phone: true }];
    expect(id(chatTarget(withPhone, undefined, 's-term', phone))).toBe('phone');
    expect(id(chatTarget(withPhone, { kind: 'workspace', sessionId: 's-term' }, null, phone))).toBe('s-term');
    expect(id(chatTarget(withPhone, { kind: 'workspace', sessionId: 's-phone' }, null, phone))).toBe('phone');
    expect(id(chatTarget(withPhone, { kind: 'phone' }, 's-term', phone))).toBe('phone');
    expect(id(chatTarget(withPhone, undefined, null, { set: false, agent: 'claude' }))).toBe('s-agent');
  });

  it('a workspace whose id happens to be "phone" is still reachable', () => {
    const named = [{ sessionId: 'phone', kind: 'agent' }];
    expect(id(chatTarget(named, { kind: 'workspace', sessionId: 'phone' }, null, { set: true, agent: 'claude' }))).toBe('phone');
    expect(chatTarget(named, { kind: 'workspace', sessionId: 'phone' }, null, { set: true, agent: 'claude' })?.kind).toBe('workspace');
  });
});

describe('the Phone workspace', () => {
  it('reads hello\'s phoneWorkspace and is absent on an older desktop', () => {
    expect(parsePhoneWorkspace({ set: true, agent: 'codex' })).toEqual({ set: true, agent: 'codex' });
    expect(parsePhoneWorkspace({ set: false, agent: 'bash' })).toEqual({ set: false, agent: null });
    expect(parsePhoneWorkspace(undefined)).toBeNull();
  });

  it('names the unavailable Phone workspace', () => {
    expect(startFailureText({ code: -32602, message: 'phone-workspace-unavailable' })).toMatch(/^The Phone workspace is not set up/);
  });
});
