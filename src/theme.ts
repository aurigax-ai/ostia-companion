import { DarkTheme, Theme } from '@react-navigation/native';

export const colors = {
  bg: '#1d2022',
  bgSunken: '#17191b',
  surface: '#272a2d',
  surfaceHigh: '#2d3134',
  line: 'rgba(255, 255, 255, 0.07)',
  lineStrong: 'rgba(255, 255, 255, 0.13)',
  ripple: 'rgba(255, 255, 255, 0.08)',
  fg: '#e3edf5',
  muted: '#9aa1a5',
  dim: '#767d82',
  brand: '#00d8ff',
  brandSoft: 'rgba(0, 216, 255, 0.14)',
  onBrand: '#1d2022',
  attn: '#bf5f54',
  attnSoft: 'rgba(191, 95, 84, 0.18)',
  attnFg: '#db8176',
  warn: '#e0a458',
  ok: '#58c98c',
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
