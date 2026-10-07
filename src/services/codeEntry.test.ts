import { describe, expect, it } from 'vitest';
import { codeInput, codeToSubmit } from './pairCode';

describe('pairing code entry', () => {
  it('CRD-C15 lowercase with a dash fills the boxes and completes the code', () => {
    expect(codeInput('k7qm-r2x4')).toEqual({ chars: 'K7QMR2X4', code: 'K7QMR2X4' });
  });

  it('CRD-C16 drops characters outside the code alphabet and stays incomplete', () => {
    expect(codeInput('ko7i 0q1m')).toEqual({ chars: 'K7QM', code: null });
  });

  it('CRD-C17 does not resend a code that failed until it changes', () => {
    expect(codeToSubmit('K7QMR2X4', 'K7QMR2X4')).toBeNull();
    expect(codeToSubmit(null, 'K7QMR2X4')).toBeNull();
    expect(codeToSubmit('K7QMR2X5', 'K7QMR2X4')).toBe('K7QMR2X5');
    expect(codeToSubmit('K7QMR2X4', null)).toBe('K7QMR2X4');
  });

  it('CRD-C18 keeps only the first eight valid characters of a long paste', () => {
    expect(codeInput('ABCD-EFGH-JKLM')).toEqual({ chars: 'ABCDEFGH', code: 'ABCDEFGH' });
  });
});
