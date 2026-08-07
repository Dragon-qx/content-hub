'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';

export interface TrendPoint {
  date: string;
  value: number;
}

/**
 * A lightweight dependency-free SVG line chart. Renders a smooth polyline
 * with a soft fill, gridlines, and min/max labels. Scales to its container
 * via the `height` prop; width is 100%.
 */
export default function TrendChart({
  data,
  height: baseHeight = 200,
  heightMd = 240,
  stroke = '#6366f1',
  fill = '#eef2ff',
}: {
  data: TrendPoint[];
  height?: number;
  heightMd?: number;
  stroke?: string;
  fill?: string;
}) {
  const { t } = useT();
  const [mountedHeight, setMountedHeight] = useState(baseHeight);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setMountedHeight(mq.matches ? heightMd : baseHeight);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [baseHeight, heightMd]);

  const height = mountedHeight;
  const width = 720; // internal coordinate system; scaled by viewBox
  const padX = 8;
  const padTop = 16;
  const padBottom = 28;
  const padLeft = 8;
  const innerW = width - padLeft - padX;
  const innerH = height - padTop - padBottom;

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400" style={{ height }}>
        {t('analytics.empty')}
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const toX = (i: number) =>
    padLeft + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const toY = (v: number) => padTop + innerH - ((v - min) / range) * innerH;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.value)}`).join(' ');
  const areaPath = `${linePath} L ${toX(data.length - 1)} ${padTop + innerH} L ${toX(0)} ${padTop + innerH} Z`;

  // A handful of y-axis gridlines.
  const ticks = 4;
  const gridlines = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = min + (range * i) / ticks;
    return { y: toY(v), label: Math.round(v).toLocaleString() };
  });

  // Sparse x labels to avoid clutter.
  const labelCount = Math.min(6, data.length);
  const labelStep = Math.max(1, Math.floor(data.length / labelCount));
  const xLabels = data
    .map((d, i) => ({ i, x: toX(i), label: d.date.slice(5) }))
    .filter((_, i) => i % labelStep === 0);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={t('analytics.trend')}>
      {gridlines.map((g, i) => (
        <g key={i}>
          <line x1={padLeft} y1={g.y} x2={width - padX} y2={g.y} stroke="#e2e8f0" strokeWidth={1} />
          <text x={padLeft} y={g.y - 4} fontSize="10" fill="#94a3b8">
            {g.label}
          </text>
        </g>
      ))}
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={i} cx={toX(i)} cy={toY(d.value)} r={2.5} fill={stroke} />
      ))}
      {xLabels.map((l) => (
        <text key={l.i} x={l.x} y={height - 8} fontSize="10" fill="#94a3b8" textAnchor="middle">
          {l.label}
        </text>
      ))}
    </svg>
  );
}
