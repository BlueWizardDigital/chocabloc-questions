export function isProd(): boolean {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return true;
  if (typeof globalThis !== 'undefined') {
    const w = globalThis as { __CQ_PROD__?: boolean };
    if (w.__CQ_PROD__ === true) return true;
  }
  return false;
}
