import { describe, expect, it } from 'vitest';
import { addEntry, LOG_LIMIT, formatLog } from './connectionLog';

describe('connection log', () => {
  it('SET-C9 keeps the newest 200 events in order with their time', () => {
    let log: ReturnType<typeof addEntry> = [];
    for (let i = 0; i < 250; i++) log = addEntry(log, `event ${i}`, 1_000 * i, []);
    expect(LOG_LIMIT).toBe(200);
    expect(log).toHaveLength(200);
    expect(log[0]).toEqual({ at: 50_000, text: 'event 50' });
    expect(log[199].text).toBe('event 249');
    expect(formatLog(log).split('\n')[0]).toMatch(/^\d{4}-\d\d-\d\dT.*event 50$/);
  });

  it('SET-C10 replaces a secret in an event with [token]', () => {
    const log = addEntry([], 'hello failed for tok-abc123XYZ on 10.0.2.2', 0, ['tok-abc123XYZ', '']);
    expect(log[0].text).toBe('hello failed for [token] on 10.0.2.2');
  });
});
