import Papa from 'papaparse';

export const TABLE_ROW_LIMIT = 1000;
export const TABLE_COLUMN_LIMIT = 50;
const CHAR_WIDTH = 7.5;
const CELL_PADDING = 24;
const MIN_WIDTH = 56;
const MAX_WIDTH = 240;

export interface Table {
  header: string[];
  rows: string[][];
  total: number;
  widths: number[];
}

export function parseTable(name: string, text: string): Table {
  const parsed = Papa.parse<string[]>(text, { delimiter: /\.tsv$/i.test(name) ? '\t' : '', skipEmptyLines: true });
  const [first = [], ...rest] = parsed.data;
  const columns = Math.min(TABLE_COLUMN_LIMIT, Math.max(first.length, ...rest.slice(0, TABLE_ROW_LIMIT).map((row) => row.length)));
  const fit = (row: string[]) => Array.from({ length: columns }, (_, index) => row[index] ?? '');
  const header = fit(first);
  const rows = rest.slice(0, TABLE_ROW_LIMIT).map(fit);
  const widths = header.map((_, column) => {
    const longest = Math.max(header[column].length, ...rows.slice(0, 100).map((row) => row[column].length));
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.ceil(longest * CHAR_WIDTH) + CELL_PADDING));
  });
  return { header, rows, total: rest.length, widths };
}
