// Chance of an error-free run against program length, under the benchmark noise model.

import { useState } from 'react';

export function EspCurve({ p1, p2, initialGates = 120 }: { p1: number; p2: number; initialGates?: number }) {
  const [gates, setGates] = useState(initialGates);
  const [frac, setFrac] = useState(0.4);
  const esp = (n: number) => Math.pow(1 - p1, n * (1 - frac)) * Math.pow(1 - p2, 2 * n * frac);
  const W = 560, H = 210, L = 44;
  const x = (n: number) => L + (n / 400) * (W - L - 12);
  const y = (v: number) => 12 + (1 - v) * (H - 40);
  const pts = Array.from({ length: 81 }, (_, i) => {
    const n = (i / 80) * 400;
    return `${x(n)},${y(esp(n))}`;
  }).join(' ');
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  return (
    <div className="plate">
      <div className="plate-bar">
        <label className="chk" style={{ flex: '1 1 220px' }}>gates = {gates}<input type="range" min={0} max={400} value={gates} onChange={(e) => setGates(Number(e.target.value))} style={{ flex: 1 }} /></label>
        <label className="chk" style={{ flex: '1 1 220px' }}>two-qubit share = {Math.round(frac * 100)}%<input type="range" min={0} max={1} step={0.05} value={frac} onChange={(e) => setFrac(Number(e.target.value))} style={{ flex: 1 }} /></label>
      </div>
      <div className="plate-body">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chance of an error-free run: ${pct(esp(gates))} at ${gates} gates`}>
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={L} x2={W - 12} y1={y(t)} y2={y(t)} stroke="var(--rule)" />
              <text x={L - 8} y={y(t) + 4} fontSize={11} textAnchor="end" fill="var(--ink-3)" fontFamily="var(--label)">{t * 100}%</text>
            </g>
          ))}
          {[0, 100, 200, 300, 400].map((n) => (
            <text key={n} x={x(n)} y={H - 10} fontSize={11} textAnchor="middle" fill="var(--ink-3)" fontFamily="var(--label)">{n} gates</text>
          ))}
          <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth={2} />
          <line x1={x(gates)} x2={x(gates)} y1={12} y2={H - 28} stroke="var(--ink)" strokeDasharray="3 3" />
          <circle cx={x(gates)} cy={y(esp(gates))} r={5} fill="var(--ink)" stroke="var(--plate)" strokeWidth={2} />
          <text x={x(gates) + 9} y={y(esp(gates)) - 8} fontSize={15} fontWeight={700} fontFamily="var(--label)">{pct(esp(gates))}</text>
        </svg>
      </div>
    </div>
  );
}
