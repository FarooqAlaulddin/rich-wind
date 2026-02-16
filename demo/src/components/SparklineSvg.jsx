export function SparklineSvg({ latencies }) {
  if (!latencies || latencies.length < 2) return null;
  const len = latencies.length;
  const max = Math.max(...latencies) || 1;
  const w = 400;
  const h = 60;
  const step = w / (len - 1);

  let points = '';
  let areaPoints = `0,${h}`;
  for (let i = 0; i < len; i++) {
    const x = (i * step).toFixed(1);
    const y = (h - (latencies[i] / max) * (h - 4) - 2).toFixed(1);
    points += (i > 0 ? ' ' : '') + `${x},${y}`;
    areaPoints += ` ${x},${y}`;
  }
  areaPoints += ` ${w},${h}`;

  return (
    <svg class="an-sparkline" viewBox="0 0 400 60" preserveAspectRatio="none">
      <polyline class="an-sparkline-area" points={areaPoints} />
      <polyline points={points} />
    </svg>
  );
}
