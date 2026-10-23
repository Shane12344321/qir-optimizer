// Random OpenQASM program generator, used by the property-based tests, the
// benchmarks and the walkthrough's live fuzzer. Programs deliberately contain
// redundancy (undone gates, known-state controls, deterministic branches) so
// the optimizer has something to find — and plenty of traps it must not fall into.

import { mulberry32 } from './sim/interp';

export interface RandomOptions {
  qubits: number;
  gates: number;
  /** Probability that a gate is later followed by its inverse (possibly far away). */
  redundancy?: number;
  /** Allow mid-circuit measurement, reset and classically controlled gates. */
  dynamic?: boolean;
  /** Use parameterised rotations. */
  rotations?: boolean;
  seed: number;
}

const ONE_Q = ['h', 'x', 'y', 'z', 's', 'sdg', 't', 'tdg'];
const ROT = ['rx', 'ry', 'rz'];
const TWO_Q = ['cx', 'cz', 'swap'];
const ANGLES = ['pi/2', 'pi/4', '-pi/4', 'pi/8', '0.3', '-1.1', 'pi'];
const INVERSE: Record<string, string> = { h: 'h', x: 'x', y: 'y', z: 'z', s: 'sdg', sdg: 's', t: 'tdg', tdg: 't', cx: 'cx', cz: 'cz', swap: 'swap', ccx: 'ccx' };

export function randomProgram(o: RandomOptions): string {
  const rng = mulberry32(o.seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rng() * xs.length)];
  const n = Math.max(1, o.qubits);
  const redundancy = o.redundancy ?? 0.3;
  const lines: string[] = ['OPENQASM 2.0;', 'include "qelib1.inc";', `qreg q[${n}];`, `creg c[${n}];`];
  const pending: { at: number; line: string }[] = [];
  const distinct = (k: number) => {
    const qs: number[] = [];
    while (qs.length < k) {
      const q = Math.floor(rng() * n);
      if (!qs.includes(q)) qs.push(q);
    }
    return qs;
  };

  for (let g = 0; g < o.gates; g++) {
    for (const p of pending.filter((p) => p.at === g)) lines.push(p.line);
    const roll = rng();
    let line: string;
    let inverse: string | undefined;
    if (o.dynamic && roll < 0.06) {
      const q = Math.floor(rng() * n);
      line = `measure q[${q}] -> c[${q}];`;
    } else if (o.dynamic && roll < 0.09) {
      line = `reset q[${Math.floor(rng() * n)}];`;
    } else if (o.dynamic && roll < 0.13) {
      const q = Math.floor(rng() * n);
      line = `if (c == ${Math.floor(rng() * 2 ** Math.min(n, 3))}) x q[${q}];`;
    } else if (n >= 3 && roll < 0.18) {
      const [a, b, c] = distinct(3);
      line = `ccx q[${a}], q[${b}], q[${c}];`;
      inverse = line;
    } else if (n >= 2 && roll < 0.45) {
      const name = pick(TWO_Q);
      const [a, b] = distinct(2);
      line = `${name} q[${a}], q[${b}];`;
      inverse = rng() < 0.5 || name === 'cx' ? line : `${name} q[${b}], q[${a}];`;
    } else if (o.rotations !== false && roll < 0.65) {
      const name = pick(ROT);
      const q = Math.floor(rng() * n);
      const angle = pick(ANGLES);
      line = `${name}(${angle}) q[${q}];`;
      inverse = `${name}(-(${angle})) q[${q}];`;
    } else {
      const name = pick(ONE_Q);
      const q = Math.floor(rng() * n);
      line = `${name} q[${q}];`;
      inverse = `${INVERSE[name]} q[${q}];`;
    }
    lines.push(line);
    if (inverse && rng() < redundancy) {
      const gap = rng() < 0.5 ? 0 : 1 + Math.floor(rng() * 4);
      pending.push({ at: g + 1 + gap, line: inverse });
    }
  }
  for (const p of pending.filter((p) => p.at >= o.gates)) lines.push(p.line);
  lines.push('measure q -> c;');
  return `${lines.join('\n')}\n`;
}
