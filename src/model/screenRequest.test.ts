import { describe, expect, it } from 'vitest';
import { parseScreenRequest } from './screenRequest';

const sessions = [{ sessionId: 's-ledger', name: 'ledger-api', kind: 'agent', workDir: '/w', state: 'idle' as const }];

describe('screen requests', () => {
  it('PHA-C11 names the asking agent, its workspace and its reason', () => {
    const request = parseScreenRequest(
      { requestId: 'req-1', sessionId: 's-ledger', by: 'agent', agent: 'claude', reason: '  Free up space: find apps unused for 3 months ' },
      sessions,
    );
    expect(request).toEqual({
      requestId: 'req-1',
      sessionId: 's-ledger',
      workspace: 'ledger-api',
      agent: 'claude',
      title: 'claude in ledger-api wants to use this phone',
      reason: 'Free up space: find apps unused for 3 months',
    });
  });

  it('names the workspace even when the human clicked on the desktop or the desktop is v1.8', () => {
    expect(parseScreenRequest({ sessionId: 's-ledger', by: 'desktop' }, sessions)).toEqual({
      requestId: null, sessionId: 's-ledger', workspace: 'ledger-api', agent: null, title: 'An agent in ledger-api wants to use this phone', reason: null,
    });
  });

  it('cuts a long reason, drops an odd request id and ignores a request without a workspace', () => {
    expect(parseScreenRequest({ sessionId: 's-x', by: 'agent', agent: 'codex', reason: 'x'.repeat(500) }, sessions)?.reason).toHaveLength(300);
    expect(parseScreenRequest({ sessionId: 's-ledger', requestId: 'a b\n' }, sessions)?.requestId).toBeNull();
    expect(parseScreenRequest({ by: 'agent' }, sessions)).toBeNull();
    expect(parseScreenRequest(null, sessions)).toBeNull();
  });
});
