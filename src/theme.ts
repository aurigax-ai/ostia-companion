export const colors = {
  bg: '#161616',
  bgSunken: '#0f0f0f',
  surface: '#202020',
  surfaceHigh: '#2b2b2b',
  surfacePressed: '#333333',
  line: 'rgba(255, 255, 255, 0.07)',
  lineStrong: 'rgba(255, 255, 255, 0.14)',
  ripple: 'rgba(255, 255, 255, 0.08)',
  fg: '#f2f4f8',
  muted: '#a2a2a2',
  dim: '#6f6f6f',
  brand: '#f2b347',
  brandSoft: 'rgba(242, 179, 71, 0.16)',
  onBrand: '#161616',
  attn: '#ee5396',
  attnSoft: 'rgba(238, 83, 150, 0.16)',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

export const font = {
  regular: 'Inter_400Regular',
  semibold: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoSemibold: 'JetBrainsMono_600SemiBold',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, full: 999 };

export const elevation = {
  sheet: '0 -8px 24px rgba(0, 0, 0, 0.4)',
};

export const type = {
  title: { fontFamily: font.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, color: colors.fg },
  headline: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.1, color: colors.fg },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 22, color: colors.fg },
  bodyMuted: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: colors.muted },
  label: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: colors.fg },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: colors.muted },
  captionStrong: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color: colors.muted },
  mono: { fontFamily: font.mono, fontSize: 12, lineHeight: 16, color: colors.muted },
  monoLabel: { fontFamily: font.monoSemibold, fontSize: 14, lineHeight: 20, color: colors.fg },
};
