import { DarkTheme, Theme } from '@react-navigation/native';

export const colors = {
  bg: '#161616',
  bgSunken: '#0d0d0d',
  surface: '#1c1c1c',
  surfaceHigh: '#262626',
  line: 'rgba(255, 255, 255, 0.09)',
  lineStrong: 'rgba(255, 255, 255, 0.16)',
  ripple: 'rgba(255, 255, 255, 0.08)',
  fg: '#f2f4f8',
  muted: '#a8a8a8',
  dim: '#696969',
  brand: '#f2b347',
  brandSoft: 'rgba(242, 179, 71, 0.16)',
  onBrand: '#161616',
  attn: '#ee5396',
  attnSoft: 'rgba(238, 83, 150, 0.18)',
  attnFg: '#ee5698',
  warn: '#f2c55c',
  ok: '#42be65',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

export const type = {
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const, color: colors.fg },
  headline: { fontSize: 28, lineHeight: 34, fontWeight: '600' as const, color: colors.fg },
  body: { fontSize: 16, lineHeight: 22, color: colors.fg },
  bodyMuted: { fontSize: 14, lineHeight: 20, color: colors.muted },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const, color: colors.fg },
  caption: { fontSize: 12, lineHeight: 16, color: colors.muted },
  mono: { fontFamily: 'monospace', fontSize: 13, lineHeight: 18, color: colors.muted },
};

export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.brand,
    background: colors.bg,
    card: colors.bg,
    text: colors.fg,
    border: colors.line,
    notification: colors.attn,
  },
};
