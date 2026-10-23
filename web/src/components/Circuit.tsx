import { useMemo } from 'react';
import type { Module } from '@core';
import { type Item, layoutCircuit } from '../lib/circuit';

export interface Marks {
  removed?: Set<number>;
  changed?: Set<number>;
  added?: Set<number>;
  refused?: Set<number>;
  blocker?: Set<number>;
}

interface Props {
  module: Module;
  marks?: Marks;
  rowOrder?: string[];
  colW?: number;
  rowH?: number;
  /** Fix the column count so before/after diagrams share a scale. */
  minCols?: number;
  showBlocks?: boolean;
  onSelect?: (id: number) => void;
  label?: string;
}

const INK = 'var(--ink)';
const ACC = 'var(--accent)';
const REF = 'var(--refuse)';

export function Circuit({ module, marks = {}, rowOrder, colW = 54, rowH = 44, minCols = 0, showBlocks = true, onSelect, label }: Props) {
  const layout = useMemo(() => layoutCircuit(module, rowOrder), [module, rowOrder]);
  const left = 92;
  const top = showBlocks && layout.blocks.length > 1 ? 34 : 14;
  const cols = Math.max(layout.cols, minCols, 1);
  const width = left + cols * colW + 28;
  const bottom = showBlocks && layout.blocks.length > 1 ? 34 : 12;
  const height = top + layout.rows.length * rowH + bottom;
  const cx = (col: number) => left + col * colW + colW / 2;
  const cy = (row: number) => top + row * rowH + rowH / 2;

  return (
    <div className="circuit" role="img" aria-label={label ?? `Circuit with ${layout.items.filter((i) => i.kind === 'gate').length} gates`}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {showBlocks && layout.blocks.length > 1 &&
          layout.blocks.map((b, i) => (
            <g key={`b${i}-${b.label}`}>
              {i > 0 && <line x1={left + (b.start - 0.5) * colW} x2={left + (b.start - 0.5) * colW} y1={8} y2={height - 6} stroke={INK} strokeDasharray="2 4" strokeWidth={1} />}
              <text x={left + b.start * colW + 4} y={20} fontSize={12.5} fill="var(--ink-2)" fontWeight={600}>%{b.label}</text>
              {b.term && (b.end - b.start + 1) * colW > b.term.length * 6.6 && (
                <text x={left + b.start * colW + 4} y={height - 12} fontSize={11.5} fill="var(--ink-3)" fontFamily="var(--mono)">{b.term}</text>
              )}
            </g>
          ))}
        {layout.rows.map((r, i) => (
          <g key={r.key}>
            <text x={left - 14} y={cy(i) + 4.5} fontSize={13} textAnchor="end" fill={INK} fontWeight={600}>{r.name}</text>
            <line x1={left - 6} x2={width - 10} y1={cy(i)} y2={cy(i)} stroke="#9c9c96" strokeWidth={1} />
          </g>
        ))}
        {layout.items.map((it) => (
          <GateGlyph key={it.id} item={it} x={cx(it.col)} cy={cy} rowH={rowH} marks={marks} onSelect={onSelect} />
        ))}
      </svg>
    </div>
  );
}

function stateOf(id: number, m: Marks): 'removed' | 'changed' | 'added' | 'refused' | 'blocker' | undefined {
  if (m.removed?.has(id)) return 'removed';
  if (m.changed?.has(id)) return 'changed';
  if (m.added?.has(id)) return 'added';
  if (m.refused?.has(id)) return 'refused';
  if (m.blocker?.has(id)) return 'blocker';
  return undefined;
}

function GateGlyph({ item, x, cy, rowH, marks, onSelect }: { item: Item; x: number; cy: (r: number) => number; rowH: number; marks: Marks; onSelect?: (id: number) => void }) {
  const st = stateOf(item.id, marks);
  const stroke = st === 'removed' || st === 'changed' || st === 'added' ? ACC : st === 'refused' || st === 'blocker' ? REF : INK;
  const fill = st === 'added' ? 'var(--accent-wash)' : st === 'refused' ? 'var(--refuse-wash)' : 'var(--plate)';
  const sw = st ? 2 : 1.4;
  const ys = item.rows.map(cy);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const h = Math.min(30, rowH - 10);
  const box = (y: number, text: string, w = h + 2) => {
    const width = Math.max(w, text.length * 7.4 + 12);
    return (
      <g>
        <rect x={-width / 2} y={y - h / 2} width={width} height={h} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={st === 'refused' ? '4 3' : undefined} />
        <text x={0} y={y + 5} fontSize={text.length > 4 ? 12 : h < 28 ? 13.5 : 15} fontWeight={700} textAnchor="middle" fill={INK}>{text}</text>
      </g>
    );
  };
  let body: JSX.Element;
  const g = item.gate;
  if (item.kind === 'barrier') {
    body = <rect x={-5} y={minY - 18} width={10} height={maxY - minY + 36} fill="var(--rule-2)" stroke={stroke} strokeDasharray="3 3" />;
  } else if (item.kind === 'measure') {
    const y = ys[0];
    body = (
      <g>
        <rect x={-16} y={y - 15} width={32} height={30} fill={fill} stroke={stroke} strokeWidth={sw} />
        <path d={`M -10 ${y + 7} A 10 10 0 0 1 10 ${y + 7}`} fill="none" stroke={INK} strokeWidth={1.3} />
        <line x1={0} y1={y + 7} x2={8} y2={y - 6} stroke={INK} strokeWidth={1.3} />
        <text x={0} y={y + rowH / 2 + 1} fontSize={10.5} textAnchor="middle" fill="var(--ink-3)">{item.label}</text>
      </g>
    );
  } else if (item.kind === 'reset') {
    body = box(ys[0], '|0⟩');
  } else if (g === 'cx' || g === 'ccx') {
    const t = ys[ys.length - 1];
    body = (
      <g>
        <line x1={0} x2={0} y1={minY} y2={maxY} stroke={stroke} strokeWidth={sw} />
        {ys.slice(0, -1).map((y, k) => <circle key={k} cx={0} cy={y} r={5} fill={stroke} />)}
        <circle cx={0} cy={t} r={h * 0.4} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={st === 'refused' ? '4 3' : undefined} />
        <line x1={-h * 0.4} x2={h * 0.4} y1={t} y2={t} stroke={stroke} strokeWidth={sw} />
        <line x1={0} x2={0} y1={t - h * 0.4} y2={t + h * 0.4} stroke={stroke} strokeWidth={sw} />
      </g>
    );
  } else if (g === 'cz') {
    body = (
      <g>
        <line x1={0} x2={0} y1={minY} y2={maxY} stroke={stroke} strokeWidth={sw} />
        {ys.map((y, k) => <circle key={k} cx={0} cy={y} r={5} fill={stroke} />)}
      </g>
    );
  } else if (g === 'swap') {
    body = (
      <g>
        <line x1={0} x2={0} y1={minY} y2={maxY} stroke={stroke} strokeWidth={sw} />
        {ys.map((y, k) => (
          <g key={k} stroke={stroke} strokeWidth={sw + 0.4}>
            <line x1={-7} x2={7} y1={y - 7} y2={y + 7} />
            <line x1={-7} x2={7} y1={y + 7} y2={y - 7} />
          </g>
        ))}
      </g>
    );
  } else {
    body = box(ys[0], item.label);
  }
  return (
    <g
      className="g"
      style={{ transform: `translate(${x}px, 0px)`, cursor: onSelect ? 'pointer' : undefined }}
      onClick={onSelect ? () => onSelect(item.id) : undefined}
    >
      {body}
      {(st === 'refused' || st === 'blocker') && (
        <rect x={-24} y={minY - rowH / 2 + 3} width={48} height={maxY - minY + rowH - 6} fill="none" stroke={REF} strokeWidth={1.4} strokeDasharray={st === 'refused' ? '5 3' : '1.5 3'} />
      )}
      {st === 'removed' && ys.map((y, k) => (
        <line key={k} x1={-19} x2={19} y1={y + 16} y2={y - 16} stroke={ACC} strokeWidth={2.4} strokeLinecap="round" />
      ))}
    </g>
  );
}
