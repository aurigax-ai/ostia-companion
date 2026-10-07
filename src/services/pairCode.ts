export const CODE_LENGTH = 8;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

export function normalizeCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  return CODE.test(code) ? code : null;
}

export function codeProblem(input: string): string | null {
  if (!input.trim() || normalizeCode(input)) return null;
  return 'The code is 8 letters and digits from the desktop, like ABCD-EFGH.';
}

export function codeInput(raw: string): { chars: string; code: string | null } {
  const chars = [...raw.toUpperCase()].filter((char) => ALPHABET.includes(char)).slice(0, CODE_LENGTH).join('');
  return { chars, code: chars.length === CODE_LENGTH ? chars : null };
}

export function codeToSubmit(code: string | null, failed: string | null): string | null {
  return code !== null && code !== failed ? code : null;
}
