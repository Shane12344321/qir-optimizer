// Dependence DAG of one basic block: a node per quantum operation, an edge
// between successive operations on the same qubit wire.

import { useMemo } from 'react';
import type { Module } from '@core';
import { layoutCircuit } from '../lib/circuit';

export function DagView({ module, blockIndex = 0, highlight }: { module: Module; blockIndex?: number; highlight?: Set<number> }) {
  const g = useMemo(() => {
    const layout = layoutCircuit(module);
    const items = layout.items.filter((i) => i.block === blockIndex && i.kind !== 'branch');
    const lastOnRow = new Map<number, number>();
    const edges: { from: number; to: number; row: number }[] = [];
    for (const it of items) {
      const rows = it.kind === 'barrier' ? layout.rows.map((_, k) => k) : it.rows;
      for (const r of rows) {
        const prev = lastOnRow.get(r);
        if (prev !== undefined) edges.push({ from: prev, to: it.id, row: r });
        lastOnRow.set(r, it.id);
      }
    }
    const cols = Math.max(1, ...items.map((i) => i.col - (layout.blocks[blockIndex]?.start ?? 0) + 1));
    return { layout, items, edges, cols, start: layout.blocks[blockIndex]?.start ?? 0 };
  }, [module, blockIndex]);

  const colW = 74;
  const rowH = 46;
  const left = 70;
  const width = left + g.cols * colW + 20;
  const height = 24 + g.layout.rows.length * rowH;
  const pos = new Map(g.items.map((it) => {
    const rows = it.rows;
    const y = 24 + ((Math.min(...rows) + Math.max(...rows)) / 2) * rowH + rowH / 2 - 12;
    return [it.id, { x: left + (it.col - g.start) * colW + colW / 2, y }];
  }));

  return (
    <div className="circuit" role="img" aria-label={`Dependence DAG with ${g.items.length} nodes and ${g.edges.length} edges`}>
      <svg width={width} height={height}>
        <defs>
          <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 8 4 0 8z" fill="var(--ink-2)" />
          </marker>
        </defs>
        {g.layout.rows.map((r, i) => (
          <text key={r.key} x={8} y={24 + i * rowH + rowH / 2 - 8} fontSize={12} fill="var(--ink-3)" fontFamily="var(--label)">{r.name}</text>
        ))}
        {g.edges.map((e, k) => {
          const a = pos.get(e.from)!;
          const b = pos.get(e.to)!;
          const mx = (a.x + b.x) / 2;
          return <path key={k} d={`M${a.x + 22} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x - 24} ${b.y}`} fill="none" stroke="var(--ink-2)" strokeWidth={1.1} markerEnd="url(#arr)" />;
        })}
        {g.items.map((it) => {
          const p = pos.get(it.id)!;
          const hi = highlight?.has(it.id);
          const label = it.kind === 'measure' ? 'M' : it.kind === 'barrier' ? 'call' : it.kind === 'reset' ? 'reset' : it.label;
          return (
            <g key={it.id}>
              <rect x={p.x - 22} y={p.y - 13} width={44} height={26} rx={13} fill={hi ? 'var(--accent-wash)' : it.kind === 'gate' ? 'var(--plate)' : 'var(--rule-2)'} stroke={hi ? 'var(--accent)' : 'var(--ink)'} strokeWidth={hi ? 2 : 1.2} />
              <text x={p.x} y={p.y + 4.5} fontSize={label.length > 4 ? 10.5 : 13} textAnchor="middle" fontWeight={700} fontFamily="var(--label)">{label.length > 7 ? `${label.slice(0, 6)}…` : label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
