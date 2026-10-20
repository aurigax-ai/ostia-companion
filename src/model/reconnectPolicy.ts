export const timing = {
  candidateMs: 5000,
  minDelayMs: 500,
  maxDelayMs: 8000,
  unreachableMaxDelayMs: 60000,
  minScanDelayMs: 10000,
  maxScanDelayMs: 300000,
};

export function nextDelay(delay: number, max: number): number {
  return Math.min(delay * 2, max);
}

export function delayCap(cycleFailed: boolean): number {
  return cycleFailed ? timing.unreachableMaxDelayMs : timing.maxDelayMs;
}

export function scanDue(now: number, scanAt: number): boolean {
  return now >= scanAt;
}

export function nextScan(now: number, scanDelay: number): { scanAt: number; scanDelay: number } {
  return { scanAt: now + scanDelay, scanDelay: nextDelay(scanDelay, timing.maxScanDelayMs) };
}
