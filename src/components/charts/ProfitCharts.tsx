'use client';

import { useId } from 'react';
import { Num } from '@/components/ui/Num';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import type { ProfitPoint } from '@/lib/domain/stats';

/**
 * Hand-drawn SVG charts rather than a charting dependency: the whole
 * requirement here is two small series, and SVG coordinates are absolute, so
 * we can lay the time axis out right-to-left explicitly to match the Hebrew
 * reading direction instead of fighting a library's LTR assumptions.
 */

const WIDTH = 320;
const HEIGHT = 140;
const PAD = 8;

/** Result per game. Oldest game on the right, newest on the left (RTL). */
export function PerGameChart({ points }: { points: ProfitPoint[] }) {
  if (points.length === 0) return <ChartEmpty />;

  const max = Math.max(...points.map((p) => Math.abs(p.resultAgorot)), 1);
  const inner = WIDTH - PAD * 2;
  const barWidth = Math.max(3, Math.min(22, inner / points.length - 4));
  const step = inner / points.length;
  const zeroY = HEIGHT / 2;
  const scale = (HEIGHT / 2 - PAD) / max;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-36 w-full"
        role="img"
        aria-label="תוצאה לכל משחק"
      >
        <line
          x1={0}
          x2={WIDTH}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--color-line)"
          strokeWidth={1}
        />
        {points.map((point, index) => {
          const height = Math.abs(point.resultAgorot) * scale;
          // Right-to-left: index 0 (oldest) sits at the right edge.
          const x = WIDTH - PAD - (index + 1) * step + (step - barWidth) / 2;
          const positive = point.resultAgorot >= 0;
          return (
            <rect
              key={point.index}
              x={x}
              y={positive ? zeroY - height : zeroY}
              width={barWidth}
              height={Math.max(height, 1)}
              rx={2}
              fill={positive ? 'var(--color-profit)' : 'var(--color-loss)'}
              opacity={0.9}
            >
              <title>{`${point.label}: ${formatSignedMoney(point.resultAgorot)}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[0.65rem] text-ink-faint">
        <span>המשחק האחרון</span>
        <span>המשחק הראשון</span>
      </figcaption>
    </figure>
  );
}

/** Cumulative lifetime profit/loss. */
export function CumulativeChart({ points }: { points: ProfitPoint[] }) {
  const gradientId = useId();
  if (points.length === 0) return <ChartEmpty />;

  const values = points.map((p) => p.cumulativeAgorot);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const inner = WIDTH - PAD * 2;

  const xAt = (index: number) =>
    points.length === 1
      ? WIDTH / 2
      : WIDTH - PAD - (index / (points.length - 1)) * inner;
  const yAt = (value: number) => PAD + ((max - value) / span) * (HEIGHT - PAD * 2);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(p.cumulativeAgorot)}`).join(' ');
  const area = `${line} L${xAt(points.length - 1)},${yAt(min)} L${xAt(0)},${yAt(min)} Z`;
  const last = points[points.length - 1]!;
  const positive = last.cumulativeAgorot >= 0;
  const stroke = positive ? 'var(--color-profit)' : 'var(--color-loss)';

  return (
    <figure>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-36 w-full"
        role="img"
        aria-label="מאזן מצטבר"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {min < 0 && max > 0 ? (
          <line
            x1={0}
            x2={WIDTH}
            y1={yAt(0)}
            y2={yAt(0)}
            stroke="var(--color-line)"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
        ) : null}
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={xAt(points.length - 1)} cy={yAt(last.cumulativeAgorot)} r={4} fill={stroke} />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[0.65rem] text-ink-faint">
        <span>
          <Num>{formatMoney(last.cumulativeAgorot)}</Num>
        </span>
        <span>ההתחלה</span>
      </figcaption>
    </figure>
  );
}

function ChartEmpty() {
  return (
    <div className="grid h-36 place-items-center rounded-xl border border-dashed border-line text-sm text-ink-faint">
      אין מספיק נתונים להצגת גרף
    </div>
  );
}
