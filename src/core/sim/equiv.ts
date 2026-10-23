// Equivalence checking — the "translation validation" half of the optimizer.
//
// program mode: both programs start in |0…0⟩ (QIR entry-point semantics). Every
//   measurement branch is explored; for each branch we compare its probability,
//   the measurement record and the final quantum state up to a global phase.
// unitary mode: for straight-line circuits, compare the full unitaries column by
//   column, requiring a single consistent global phase. Stronger, but only
//   valid for rewrites that do not depend on the input state.

import type { Module } from '../qir/ir';
import { enumeratePaths, layoutOfModules, mainFunction, SimulationError } from './interp';
import { inner, StateVector } from './statevector';

export interface EquivResult {
  equivalent: boolean;
  /** Worst-case state fidelity across branches (1 = identical up to global phase). */
  fidelity: number;
  /** Total variation distance between the measurement distributions. */
  tvd: number;
  method: 'program' | 'unitary';
  branches: number;
  detail?: string;
  /** True when the check could not run (e.g. too many qubits); `equivalent` is then false. */
  inconclusive?: boolean;
}

const TOL = 1e-7;

/** Share one qubit/result numbering between two modules so their states are comparable. */
const sharedLayout = (a: Module, b: Module) => layoutOfModules([a, b]);

export function checkEquivalence(a: Module, b: Module, mode: 'program' | 'unitary' = 'program'): EquivResult {
  try {
    return mode === 'unitary' ? unitaryEquivalence(a, b) : programEquivalence(a, b);
  } catch (e) {
    if (e instanceof SimulationError) {
      return { equivalent: false, fidelity: 0, tvd: 1, method: mode, branches: 0, detail: e.message, inconclusive: true };
    }
    throw e;
  }
}

function programEquivalence(a: Module, b: Module): EquivResult {
  const layout = sharedLayout(a, b);
  const pa = enumeratePaths(a, { layout });
  const pb = enumeratePaths(b, { layout });
  const ma = new Map(pa.map((p) => [p.key, p]));
  const mb = new Map(pb.map((p) => [p.key, p]));
  const keys = new Set([...ma.keys(), ...mb.keys()]);

  let worst = 1;
  let detail: string | undefined;
  for (const k of keys) {
    const x = ma.get(k);
    const y = mb.get(k);
    const px = x?.prob ?? 0;
    const py = y?.prob ?? 0;
    if (Math.abs(px - py) > TOL) {
      worst = 0;
      detail ??= `${k ? `branch ${k}` : 'the single execution path'}: probability ${px.toFixed(4)} vs ${py.toFixed(4)}`;
      continue;
    }
    if (!x || !y) continue;
    if (x.results.some((v, i) => v !== (y.results[i] ?? 0))) {
      worst = 0;
      detail ??= `${k ? `branch ${k}` : 'the single execution path'}: measurement results differ`;
      continue;
    }
    const [re, im] = inner(x.state, y.state);
    const f = re * re + im * im;
    if (f < worst) {
      worst = f;
      if (f < 1 - TOL) detail ??= `${k ? `branch ${k}` : 'the single execution path'}: final states differ (fidelity ${f.toFixed(6)})`;
    }
  }

  return {
    equivalent: worst > 1 - TOL,
    fidelity: worst,
    tvd: outcomeTvd(pa, pb),
    method: 'program',
    branches: keys.size,
    detail,
  };
}

function outcomeTvd(pa: { prob: number; results: Uint8Array }[], pb: { prob: number; results: Uint8Array }[]): number {
  const dist = (ps: { prob: number; results: Uint8Array }[]) => {
    const d = new Map<string, number>();
    for (const p of ps) {
      const k = p.results.join('');
      d.set(k, (d.get(k) ?? 0) + p.prob);
    }
    return d;
  };
  const da = dist(pa);
  const db = dist(pb);
  let tvd = 0;
  for (const k of new Set([...da.keys(), ...db.keys()])) tvd += Math.abs((da.get(k) ?? 0) - (db.get(k) ?? 0));
  return tvd / 2;
}

function isStraightLine(m: Module): boolean {
  const fn = mainFunction(m);
  return fn.blocks.length === 1 && fn.blocks[0].instrs.every((i) => i.op === 'gate' || i.op === 'record' || i.op === 'ret');
}

function unitaryEquivalence(a: Module, b: Module): EquivResult {
  if (!isStraightLine(a) || !isStraightLine(b)) {
    throw new SimulationError('unitary comparison needs straight-line circuits without measurement');
  }
  const layout = sharedLayout(a, b);
  const n = layout.numQubits;
  if (n > 10) throw new SimulationError(`unitary comparison is limited to 10 qubits (got ${n})`);
  let phase: [number, number] | undefined;
  let worst = 1;
  for (let k = 0; k < 1 << n; k++) {
    const init = StateVector.basis(n, k);
    const ua = enumeratePaths(a, { initial: init, layout })[0].state;
    const ub = enumeratePaths(b, { initial: init, layout })[0].state;
    const [re, im] = inner(ua, ub);
    const f = re * re + im * im;
    worst = Math.min(worst, f);
    if (f < 1 - TOL) break;
    // All columns must share one global phase, otherwise relative phases differ.
    if (!phase) phase = [re, im];
    else if (Math.abs(re - phase[0]) > 1e-6 || Math.abs(im - phase[1]) > 1e-6) {
      worst = 0;
      break;
    }
  }
  // Columns agreeing with one global phase already implies equality; a generic superposition is a cheap extra guard.
  if (worst > 1 - TOL && n > 0) {
    const plus = new StateVector(n);
    const amp = 1 / Math.sqrt(1 << n);
    for (let k = 0; k < 1 << n; k++) {
      plus.re[k] = amp * Math.cos(k * 0.7);
      plus.im[k] = amp * Math.sin(k * 0.7);
    }
    const ua = enumeratePaths(a, { initial: plus, layout })[0].state;
    const ub = enumeratePaths(b, { initial: plus, layout })[0].state;
    const [re, im] = inner(ua, ub);
    worst = Math.min(worst, re * re + im * im);
  }
  return {
    equivalent: worst > 1 - TOL,
    fidelity: worst,
    tvd: 0,
    method: 'unitary',
    branches: 1,
    detail: worst > 1 - TOL ? undefined : 'unitaries differ',
  };
}
