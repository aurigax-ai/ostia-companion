const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

export function normalizeCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  return CODE.test(code) ? code : null;
}

export function codeProblem(input: string): string | null {
  if (!input.trim() || normalizeCode(input)) return null;
  return 'The code is 8 letters and digits from the desktop, like ABCD-EFGH.';
}
