import { describe, expect, it } from 'vitest';
import { colors, type } from './theme';

function rgb(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number];
  const rgba = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  return rgba ? [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])] : null;
}

describe('theme', () => {
  it('CRD-C27 uses four text sizes and two weights', () => {
    for (const style of Object.values(type)) {
      expect([12, 14, 16, 22]).toContain(style.fontSize);
      expect([undefined, '400', '600']).toContain('fontWeight' in style ? style.fontWeight : undefined);
    }
  });

  it('CRD-C28 has one attention pink and no near copy of it', () => {
    const attn = rgb(colors.attn)!;
    const copies = Object.entries(colors).filter(([name, value]) => {
      const other = rgb(value);
      if (name === 'attn' || name === 'attnSoft' || !other) return false;
      return Math.hypot(...other.map((channel, i) => channel - attn[i])) < 24;
    });
    expect(copies).toEqual([]);
  });
});
