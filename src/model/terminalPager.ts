export const EDGE_PT = 24;

export function step(index: number, direction: 1 | -1, count: number): number {
  return Math.min(count - 1, Math.max(0, index + direction));
}

export function acceptsSwipe(x: number, width: number): boolean {
  return x >= EDGE_PT && x <= width - EDGE_PT;
}

export function afterClose(before: string[], after: string[], current: string): string | null {
  if (after.includes(current)) return current;
  if (after.length === 0) return null;
  const index = before.indexOf(current);
  const survivors = before.filter((id) => after.includes(id));
  const next = before.slice(index + 1).find((id) => after.includes(id));
  return next ?? survivors[survivors.length - 1] ?? after[0];
}
