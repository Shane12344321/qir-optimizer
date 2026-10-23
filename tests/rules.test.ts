// Exhaustive soundness checks for the algebraic rules the optimizer relies on.
// Each rule is verified against the simulator for every gate pair and every
// qubit placement on three qubits — the rules are proven, not assumed.

import { describe, expect, it } from 'vitest';
import { commutes, GATE_NAMES, GATES, type GateInstr, type GateName, isInversePair, StateVector } from '../src/core';
import { columns, qasm, sameUpToPhase, unitaryOf } from './helpers';

const N = 3;

function placements(arity: number): number[][] {
  const out: number[][] = [];
  const rec = (cur: number[]) => {
    if (cur.length === arity) return void out.push([...cur]);
    for (let q = 0; q < N; q++) if (!cur.includes(q)) rec([...cur, q]);
  };
  rec([]);
  return out;
}

const PARAM = 0.7;

function instr(g: GateName, qs: number[]): GateInstr {
  return { op: 'gate', id: 0, gate: g, qubits: qs.map((index) => ({ kind: 'static', index })), params: GATES[g].params ? [PARAM] : [] };
}

function stmt(g: GateName, qs: number[], param = PARAM): string {
  return `${g}${GATES[g].params ? `(${param})` : ''} ${qs.map((q) => `q[${q}]`).join(', ')};\n`;
}

const ALL = GATE_NAMES.flatMap((g) => placements(GATES[g].qubits).map((qs) => [g, qs] as const));

describe('commutation rule', () => {
  it('is sound: whenever it claims two gates commute, AB = BA', () => {
    let claimed = 0;
    for (const [ga, qa] of ALL) {
      for (const [gb, qb] of ALL) {
        if (!commutes(instr(ga, qa), instr(gb, qb))) continue;
        claimed++;
        const ab = unitaryOf(qasm(N, stmt(ga, qa) + stmt(gb, qb)), N);
        const ba = unitaryOf(qasm(N, stmt(gb, qb) + stmt(ga, qa)), N);
        expect(sameUpToPhase(ab, ba), `${ga}${qa} vs ${gb}${qb}`).toBe(true);
      }
    }
    expect(claimed).toBeGreaterThan(1000);
  });

  it('recognises the textbook cases', () => {
    expect(commutes(instr('rz', [0]), instr('cx', [0, 1]))).toBe(true); // Z-type on control
    expect(commutes(instr('x', [1]), instr('cx', [0, 1]))).toBe(true); // X-type on target
    expect(commutes(instr('cx', [0, 1]), instr('cx', [0, 2]))).toBe(true); // shared control
    expect(commutes(instr('cx', [0, 1]), instr('cx', [1, 0]))).toBe(false);
    expect(commutes(instr('h', [0]), instr('x', [0]))).toBe(false);
  });
});

describe('inverse rule', () => {
  it('is sound: every pair it cancels multiplies to the identity', () => {
    let claimed = 0;
    for (const [ga, qa] of ALL) {
      for (const [gb, qb] of ALL) {
        if (!isInversePair(instr(ga, qa), instr(gb, qb))) continue;
        claimed++;
        const u = unitaryOf(qasm(N, stmt(ga, qa) + stmt(gb, qb)), N);
        const id = columns(N, (k) => StateVector.basis(N, k));
        expect(sameUpToPhase(u, id), `${ga}${qa} · ${gb}${qb}`).toBe(true);
      }
    }
    expect(claimed).toBeGreaterThan(20);
  });

  it('accepts symmetric operand orders only where the gate is symmetric', () => {
    expect(isInversePair(instr('cz', [0, 1]), instr('cz', [1, 0]))).toBe(true);
    expect(isInversePair(instr('swap', [0, 2]), instr('swap', [2, 0]))).toBe(true);
    expect(isInversePair(instr('ccx', [0, 1, 2]), instr('ccx', [1, 0, 2]))).toBe(true);
    expect(isInversePair(instr('cx', [0, 1]), instr('cx', [1, 0]))).toBe(false);
    expect(isInversePair(instr('s', [0]), instr('sdg', [0]))).toBe(true);
    expect(isInversePair(instr('s', [0]), instr('s', [0]))).toBe(false);
  });
});

describe('library lowering (qelib1 → native gates)', () => {
  const controlled = (u: (s: StateVector) => void) => (k: number) => {
    const s = StateVector.basis(2, k);
    if (k & 1) u(s);
    return s;
  };

  it('u3 matches its defining matrix', () => {
    const [t, p, l] = [0.9, -0.4, 1.3];
    const ref = columns(1, (k) => {
      const s = new StateVector(1);
      const c = Math.cos(t / 2), sn = Math.sin(t / 2);
      if (k === 0) {
        s.re[0] = c; s.im[0] = 0;
        s.re[1] = Math.cos(p) * sn; s.im[1] = Math.sin(p) * sn;
      } else {
        s.re[0] = -Math.cos(l) * sn; s.im[0] = -Math.sin(l) * sn;
        s.re[1] = Math.cos(p + l) * c; s.im[1] = Math.sin(p + l) * c;
      }
      return s;
    });
    expect(sameUpToPhase(unitaryOf(qasm(1, `u3(${t}, ${p}, ${l}) q[0];`)), ref)).toBe(true);
  });

  it.each([
    ['cy', (s: StateVector) => s.apply('y', [1])],
    ['ch', (s: StateVector) => s.apply('h', [1])],
    ['crz(0.8)', (s: StateVector) => s.apply('rz', [1], [0.8])],
    ['cu1(0.8)', (s: StateVector) => { s.apply('rz', [1], [0.8]); const ph = 0.4; for (let i = 0; i < 4; i++) if (i & 1) { const r = s.re[i], im = s.im[i]; s.re[i] = r * Math.cos(ph) - im * Math.sin(ph); s.im[i] = r * Math.sin(ph) + im * Math.cos(ph); } }],
  ])('%s is the controlled gate it claims to be', (call, u) => {
    expect(sameUpToPhase(unitaryOf(qasm(2, `${call} q[0], q[1];`)), columns(2, controlled(u as (s: StateVector) => void)))).toBe(true);
  });
});
