import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from './contract';

describe('contract version', () => {
  it('SET-C4 is the version in the first line of the network contract', () => {
    const first = readFileSync(new URL('../../NETWORK-CONTRACT.md', import.meta.url), 'utf8').split('\n')[0];
    expect(first).toContain(`(v${CONTRACT_VERSION},`);
  });
});
