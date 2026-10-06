export const TERMINAL_FONT_SIZE = 13;
export const MIN_WATCH_FONT_SIZE = 6;

export function watchFontSize(measured: { cols: number; fontSize: number }, desktopCols: number): number {
  if (measured.cols <= 0 || desktopCols <= 0) return TERMINAL_FONT_SIZE;
  const fit = Math.floor(((measured.cols * measured.fontSize) / desktopCols) * 2) / 2;
  return Math.min(TERMINAL_FONT_SIZE, Math.max(MIN_WATCH_FONT_SIZE, fit));
}
