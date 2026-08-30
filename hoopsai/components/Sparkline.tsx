// Tiny inline-SVG sparkline. Color follows the trend of the series unless forced.

type Props = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  baseline?: number | null; // draw a dotted midline at this value (e.g. 0.5)
};

export default function Sparkline({ data, width = 96, height = 26, color, baseline = null }: Props) {
  if (!data || data.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 2;
  const x = (i: number) => pad + (i / (data.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const points = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const trendUp = data[data.length - 1] >= data[0];
  const stroke = color ?? (trendUp ? 'var(--green)' : 'var(--red)');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {baseline != null && baseline >= min && baseline <= max && (
        <line
          x1={pad} x2={width - pad} y1={y(baseline)} y2={y(baseline)}
          stroke="var(--faint)" strokeWidth="1" strokeDasharray="2 3"
        />
      )}
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
