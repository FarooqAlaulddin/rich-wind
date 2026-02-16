export function formatBytes(n) {
  if (n == null) return '--';
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} kB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function fmtUptime(ms) {
  if (!ms || ms < 0) return '0s';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function fmtNum(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString('en-US');
}

export function fmtPct(n) {
  if (n == null) return '0%';
  return `${Number(n).toFixed(1)}%`;
}
