export const MONO_ADVANCE = 0.6;
export const LINE_HEIGHT = 1.3;
export const MIN_FIT_SIZE = 3;
export const MAX_ZOOM = 4;

export interface Box {
  width: number;
  height: number;
}

export interface Offset {
  x: number;
  y: number;
}

export function fitToWidth(cols: number, width: number): number {
  if (cols <= 0 || width <= 0) return MIN_FIT_SIZE;
  return Math.max(MIN_FIT_SIZE, Math.floor((width / (cols * MONO_ADVANCE)) * 10) / 10);
}

export function fitToBox(cols: number, rows: number, box: Box): number {
  if (cols <= 0 || rows <= 0) return MIN_FIT_SIZE;
  const byWidth = fitToWidth(cols, box.width);
  const byHeight = Math.floor((box.height / (rows * LINE_HEIGHT)) * 10) / 10;
  return Math.max(MIN_FIT_SIZE, Math.min(byWidth, byHeight));
}

export function gridBox(cols: number, rows: number, fontSize: number): Box {
  return { width: cols * MONO_ADVANCE * fontSize, height: rows * LINE_HEIGHT * fontSize };
}

export function clampOffset(offset: Offset, content: Box, view: Box): Offset {
  const clamp = (value: number, contentSize: number, viewSize: number) =>
    contentSize <= viewSize ? 0 : Math.min(0, Math.max(viewSize - contentSize, value));
  return { x: clamp(offset.x, content.width, view.width), y: clamp(offset.y, content.height, view.height) };
}

export function zoomAbout(offset: Offset, focal: Offset, ratio: number): Offset {
  return { x: focal.x - (focal.x - offset.x) * ratio, y: focal.y - (focal.y - offset.y) * ratio };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(1, zoom));
}

export interface Grid {
  cols: number;
  rows: number;
}

export function phoneGrid(box: Box | null, fontSize: number): Grid | null {
  if (!box || box.width <= 0 || box.height <= 0) return null;
  return {
    cols: Math.max(1, Math.floor(box.width / (MONO_ADVANCE * fontSize))),
    rows: Math.max(1, Math.floor(box.height / (LINE_HEIGHT * fontSize))),
  };
}

export function sameGrid(a: Grid | null, b: Grid | null): boolean {
  return !!a && !!b && a.cols === b.cols && a.rows === b.rows;
}
