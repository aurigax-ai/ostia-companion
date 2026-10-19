import { describe, expect, it } from 'vitest';
import { parseScreenRequest } from './screenRequest';

const sessions = [{ sessionId: 's-ledger', name: 'ledger-api', kind: 'agent', workDir: '/w', state: 'idle' as const }];

describe('screen requests', () => {
  it('PHA-C11 names the asking agent, its workspace and its reason', () => {
    const request = parseScreenRequest(
      { sessionId: 's-ledger', by: 'agent', agent: 'claude', reason: '  Free up space: find apps unused for 3 months ' },
      sessions,
      'studio',
    );
    expect(request).toEqual({
      sessionId: 's-ledger',
      workspace: 'ledger-api',
      title: 'claude in ledger-api wants to use this phone',
      reason: 'Free up space: find apps unused for 3 months',
    });
  });

  it('says the desktop asks when the human clicked there or the desktop is v1.8', () => {
    expect(parseScreenRequest({ sessionId: 's-ledger', by: 'desktop' }, sessions, 'studio')).toEqual({
      sessionId: 's-ledger', workspace: 'ledger-api', title: 'studio asks to use this phone', reason: null,
    });
  });

  it('cuts a long reason and ignores a request without a workspace', () => {
    expect(parseScreenRequest({ sessionId: 's-x', by: 'agent', agent: 'codex', reason: 'x'.repeat(500) }, sessions, 'studio')?.reason).toHaveLength(300);
    expect(parseScreenRequest({ by: 'agent' }, sessions, 'studio')).toBeNull();
    expect(parseScreenRequest(null, sessions, 'studio')).toBeNull();
  });
});
