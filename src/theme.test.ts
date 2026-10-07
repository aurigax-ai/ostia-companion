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

  it('CRD-C33 keeps every saturated colour to the amber accent or the attention pink', () => {
    const hue = ([r, g, b]: number[]) => {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 40) return null;
      const h = max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min);
      return ((h * 60) + 360) % 360;
    };
    const allowed = [hue(rgb(colors.brand)!), hue(rgb(colors.attn)!)] as number[];
    const stray = Object.entries(colors).filter(([, value]) => {
      const h = hue(rgb(value) ?? [0, 0, 0]);
      return h !== null && allowed.every((a) => Math.min(Math.abs(h - a), 360 - Math.abs(h - a)) > 12);
    });
    expect(stray).toEqual([]);
  });
});
