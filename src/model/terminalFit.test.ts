import { describe, expect, it } from 'vitest';
import { clampOffset, clampZoom, fitToBox, fitToWidth, gridBox, MAX_ZOOM, MIN_FIT_SIZE, zoomAbout } from './terminalFit';

describe('terminalFit', () => {
  it('CRD-V8 sizes the font so the desktop columns fill the phone width', () => {
    const size = fitToWidth(120, 360);
    expect(gridBox(120, 40, size).width).toBeLessThanOrEqual(360);
    expect(gridBox(120, 40, size).width).toBeGreaterThan(355);
    expect(fitToWidth(40, 360)).toBe(15);
  });

  it('CRD-V9 never goes below the smallest drawable size, and fits both axes in a box', () => {
    expect(fitToWidth(900, 360)).toBe(MIN_FIT_SIZE);
    expect(fitToWidth(0, 360)).toBe(MIN_FIT_SIZE);
    const size = fitToBox(100, 50, { width: 800, height: 360 });
    expect(gridBox(100, 50, size).height).toBeLessThanOrEqual(360);
    expect(gridBox(100, 50, size).width).toBeLessThanOrEqual(800);
  });

  it('CRD-V10 keeps a panned grid inside its view, and centres nothing when it fits', () => {
    const content = { width: 600, height: 900 };
    const view = { width: 360, height: 500 };
    expect(clampOffset({ x: 40, y: 40 }, content, view)).toEqual({ x: 0, y: 0 });
    expect(clampOffset({ x: -900, y: -900 }, content, view)).toEqual({ x: -240, y: -400 });
    expect(clampOffset({ x: -50, y: -50 }, { width: 300, height: 400 }, view)).toEqual({ x: 0, y: 0 });
  });

  it('CRD-V11 zooms about the pinch point and clamps the zoom', () => {
    expect(zoomAbout({ x: 0, y: 0 }, { x: 100, y: 100 }, 2)).toEqual({ x: -100, y: -100 });
    expect(clampZoom(9)).toBe(MAX_ZOOM);
    expect(clampZoom(0.2)).toBe(1);
  });
});
