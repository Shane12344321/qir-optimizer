// Lays out a QIR function as a circuit diagram: one wire per qubit, operations
// packed into columns as early as their wires allow (ASAP scheduling), blocks
// laid left to right with their branch structure.

import { GATES, gateLabel, mainFunction, type Fn, type Instr, type Module, qubitName, type Ref, resultName } from '@core';

export type ItemKind = 'gate' | 'measure' | 'reset' | 'barrier' | 'branch';

export interface Item {
  id: number;
  kind: ItemKind;
  label: string;
  gate?: string;
  /** Row indices of the qubits, in operand order. */
  rows: number[];
  col: number;
  block: number;
  text?: string;
}

export interface BlockSpan {
  label: string;
  start: number; // first column
  end: number; // one past last column
  term?: string;
}

export interface Layout {
  rows: { key: string; name: string }[];
  items: Item[];
  blocks: BlockSpan[];
  cols: number;
}

const keyOf = (r: Ref) => (r.kind === 'static' ? `s${r.index}` : r.name);

function qubitsOf(i: Instr): Ref[] {
  if (i.op === 'gate') return i.qubits;
  if (i.op === 'measure' || i.op === 'reset') return [i.qubit];
  return [];
}

export function layoutCircuit(m: Module, rowOrder?: string[]): Layout {
  const fn: Fn = mainFunction(m);
  const rowMap = new Map<string, { key: string; name: string; order: number }>();
  const see = (r: Ref) => {
    const k = keyOf(r);
    if (!rowMap.has(k)) rowMap.set(k, { key: k, name: qubitName(fn, r), order: r.kind === 'static' ? r.index : 1e6 + rowMap.size });
  };
  for (const b of fn.blocks) for (const i of b.instrs) qubitsOf(i).forEach(see);
  // Keep rows stable across snapshots by including every qubit the original module used.
  if (rowOrder) {
    for (const k of rowOrder) {
      if (!rowMap.has(k)) {
        const idx = k.startsWith('s') ? Number(k.slice(1)) : 1e6;
        rowMap.set(k, { key: k, name: idx < 1e6 && fn.qubitNames?.[idx] ? fn.qubitNames[idx] : k.startsWith('s') ? `q${idx}` : k, order: idx });
      }
    }
  }
  const rows = [...rowMap.values()].sort((a, b) => a.order - b.order);
  const rowOf = new Map(rows.map((r, i) => [r.key, i]));

  const items: Item[] = [];
  const blocks: BlockSpan[] = [];
  let base = 0;
  fn.blocks.forEach((b, bi) => {
    const level = new Array(rows.length).fill(base);
    let maxCol = base;
    const place = (rs: number[], all = false) => {
      const lo = all ? 0 : Math.min(...rs);
      const hi = all ? rows.length - 1 : Math.max(...rs);
      let col = base;
      for (let r = lo; r <= hi; r++) col = Math.max(col, level[r]);
      for (let r = lo; r <= hi; r++) level[r] = col + 1;
      maxCol = Math.max(maxCol, col + 1);
      return col;
    };
    let term: string | undefined;
    for (const i of b.instrs) {
      if (i.op === 'gate') {
        const rs = i.qubits.map((q) => rowOf.get(keyOf(q))!);
        items.push({ id: i.id, kind: 'gate', gate: i.gate, label: gateLabel(i.gate, i.params), rows: rs, col: place(rs), block: bi });
      } else if (i.op === 'measure') {
        const rs = [rowOf.get(keyOf(i.qubit))!];
        items.push({ id: i.id, kind: 'measure', label: resultName(fn, i.result), rows: rs, col: place(rs), block: bi });
      } else if (i.op === 'reset') {
        const rs = [rowOf.get(keyOf(i.qubit))!];
        items.push({ id: i.id, kind: 'reset', label: '|0⟩', rows: rs, col: place(rs), block: bi });
      } else if (i.op === 'opaque' && i.isCall && rows.length) {
        items.push({ id: i.id, kind: 'barrier', label: i.callee?.replace(/^__quantum__\w+?__/, '') ?? 'call', rows: rows.map((_, k) => k), col: place([], true), block: bi, text: i.text });
      } else if (i.op === 'br') {
        term = i.cond ? `br ${i.cond.kind === 'local' ? i.cond.name : i.cond.value ? 'true' : 'false'} ? %${i.ifTrue} : %${i.ifFalse}` : `br %${i.ifTrue}`;
      } else if (i.op === 'ret') {
        term = 'ret';
      }
    }
    blocks.push({ label: b.label, start: base, end: Math.max(maxCol, base + 1), term });
    base = Math.max(maxCol, base + 1) + (bi < fn.blocks.length - 1 ? 1 : 0);
  });
  return { rows, items, blocks, cols: base };
}

export function rowKeys(m: Module): string[] {
  const fn = mainFunction(m);
  const keys: string[] = [];
  for (const b of fn.blocks) for (const i of b.instrs) for (const q of qubitsOf(i)) if (!keys.includes(keyOf(q))) keys.push(keyOf(q));
  return keys;
}

export function isMultiQubit(g?: string): boolean {
  return !!g && GATES[g as keyof typeof GATES]?.qubits > 1;
}
