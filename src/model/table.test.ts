import { describe, expect, it } from 'vitest';
import { TABLE_ROW_LIMIT, parseTable } from './table';

describe('table', () => {
  it('ART-C8 reads a CSV with quoted commas into a header and rows', () => {
    const table = parseTable('t.csv', 'route,p50\n"/ws, attach",3\n/pair,12\n');
    expect(table.header).toEqual(['route', 'p50']);
    expect(table.rows).toEqual([['/ws, attach', '3'], ['/pair', '12']]);
    expect(table.widths).toHaveLength(2);
  });

  it('ART-C9 reads a TSV by tabs and pads short rows', () => {
    const table = parseTable('t.tsv', 'a\tb,c\td\n1\n');
    expect(table.header).toEqual(['a', 'b,c', 'd']);
    expect(table.rows).toEqual([['1', '', '']]);
  });

  it('ART-C10 keeps the first 1,000 rows and the real count', () => {
    const table = parseTable('big.csv', `n\n${Array.from({ length: 1500 }, (_, index) => index).join('\n')}\n`);
    expect(table.rows).toHaveLength(TABLE_ROW_LIMIT);
    expect(table.total).toBe(1500);
  });
});
