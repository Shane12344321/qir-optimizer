// Benchmark charts. Pass configurations are ordered (each adds passes to the
// previous), so they use one neutral ramp light→dark; ultramarine stays reserved
// for rewrite marks elsewhere on the page.

import { useState } from 'react';

export interface BenchRow {
  id: string;
  family: string;
  qubits: number;
  before: { gates: number; twoQubit: number; depth: number; blocks: number };
  results: Record<string, { after: { gates: number; twoQubit: number; depth: number; blocks: number }; timeMs: number; rewrites: number }>;
  equivalent: boolean | 'skipped';
  espBefore: number;
  espAfter: number;
  successBefore?: number;
  successAfter?: number;
  metric?: 'hellinger' | 'esp';
}

export const CONFIGS = [
  { key: 'adjacent-only', label: 'Adjacent pairs (Review 2 prototype)', color: '#b4b4ad' },
  { key: 'peephole', label: 'Peephole over the wire DAG', color: '#74746d' },
  { key: 'full', label: 'Full hybrid pipeline', color: '#151515' },
] as const;

interface Tip { x: number; y: number; text: string[] }

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div role="tooltip" style={{ position: 'absolute', left: tip.x + 14, top: tip.y - 10, background: 'var(--ink)', color: 'var(--plate)', padding: '7px 10px', fontSize: 13, lineHeight: 1.45, fontFamily: 'var(--label)', pointerEvents: 'none', zIndex: 5, whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(0,0,0,.18)' }}>
      {tip.text.map((t, i) => <div key={i} style={{ fontWeight: i === 0 ? 700 : 500 }}>{t}</div>)}
    </div>
  );
}

/** Gates remaining after each configuration, as a share of the input. Lower is better. */
export function AblationChart({ rows }: { rows: BenchRow[] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const barH = 6;
  const gap = 2;
  const groupH = CONFIGS.length * (barH + gap) + 12;
  const left = 190;
  const W = 760;
  const plotW = W - left - 60;
  const H = rows.length * groupH + 34;
  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setTip(null)}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: 'var(--label)', fontSize: 13.5, marginBottom: 8 }}>
        {CONFIGS.map((c) => <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, background: c.color, borderRadius: 2 }} />{c.label}</span>)}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gates remaining per benchmark under three pass configurations">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={left + t * plotW} x2={left + t * plotW} y1={14} y2={H - 18} stroke={t === 0 ? 'var(--ink)' : 'var(--rule)'} />
            <text x={left + t * plotW} y={H - 4} fontSize={11} textAnchor="middle" fill="var(--ink-3)" fontFamily="var(--label)">{t * 100}%</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y0 = 18 + i * groupH;
          return (
            <g key={r.id}>
              <text x={left - 10} y={y0 + groupH / 2 - 2} fontSize={12.5} textAnchor="end" fontFamily="var(--label)" fill="var(--ink)">{r.id}</text>
              {CONFIGS.map((c, k) => {
                const frac = r.results[c.key].after.gates / Math.max(1, r.before.gates);
                const y = y0 + k * (barH + gap);
                const w = Math.max(2, frac * plotW);
                return (
                  <g key={c.key}
                    onMouseMove={(e) => {
                      const box = (e.currentTarget.ownerSVGElement!.parentElement as HTMLElement).getBoundingClientRect();
                      setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text: [r.id, c.label, `${r.results[c.key].after.gates} of ${r.before.gates} gates (${(frac * 100).toFixed(0)}%)`] });
                    }}>
                    <rect x={left} y={y - 2} width={plotW} height={barH + 4} fill="transparent" />
                    <path d={`M${left} ${y} h${w - 3} a3 3 0 0 1 3 3 a3 3 0 0 1 -3 3 h${-(w - 3)} z`} fill={c.color} />
                    {k === 2 && <text x={left + w + 6} y={y + 6} fontSize={11} fill="var(--ink-2)" fontFamily="var(--label)">{(frac * 100).toFixed(0)}%</text>}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Estimated success probability before and after: a dumbbell per benchmark. */
export function EspChart({ rows }: { rows: BenchRow[] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const left = 190;
  const W = 760;
  const plotW = W - left - 40;
  const rowH = 22;
  const H = rows.length * rowH + 40;
  const x = (v: number) => left + v * plotW;
  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setTip(null)}>
      <div style={{ display: 'flex', gap: 18, fontFamily: 'var(--label)', fontSize: 13.5, marginBottom: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg width={12} height={12}><circle cx={6} cy={6} r={5} fill="var(--plate)" stroke="var(--ink)" strokeWidth={1.6} /></svg>input program</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg width={12} height={12}><circle cx={6} cy={6} r={5} fill="#151515" /></svg>after the full pipeline</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Estimated success probability before and after optimization">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={10} y2={H - 22} stroke="var(--rule)" />
            <text x={x(t)} y={H - 6} fontSize={11} textAnchor="middle" fill="var(--ink-3)" fontFamily="var(--label)">{t * 100}%</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = 20 + i * rowH;
          return (
            <g key={r.id} onMouseMove={(e) => {
              const box = (e.currentTarget.ownerSVGElement!.parentElement as HTMLElement).getBoundingClientRect();
              setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text: [r.id, `ESP ${(r.espBefore * 100).toFixed(1)}% → ${(r.espAfter * 100).toFixed(1)}%`, `×${(r.espAfter / Math.max(r.espBefore, 1e-12)).toFixed(r.espAfter / r.espBefore > 10 ? 0 : 2)}`] });
            }}>
              <rect x={0} y={y - rowH / 2} width={W} height={rowH} fill="transparent" />
              <text x={left - 10} y={y + 4} fontSize={12.5} textAnchor="end" fontFamily="var(--label)">{r.id}</text>
              <line x1={x(r.espBefore)} x2={x(r.espAfter)} y1={y} y2={y} stroke="#b4b4ad" strokeWidth={2} />
              <circle cx={x(r.espBefore)} cy={y} r={5} fill="var(--plate)" stroke="var(--ink)" strokeWidth={1.6} />
              <circle cx={x(r.espAfter)} cy={y} r={5} fill="#151515" stroke="var(--plate)" strokeWidth={2} />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}
