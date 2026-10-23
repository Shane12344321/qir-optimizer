import { compileQasm, enumeratePaths, layoutOf, type Module, StateVector } from '../src/core';

export const HEADER = 'OPENQASM 2.0;\ninclude "qelib1.inc";\n';

export function qasm(n: number, body: string, cregs = 0): Module {
  return compileQasm(`${HEADER}qreg q[${n}];\n${cregs ? `creg c[${cregs}];\n` : ''}${body}`).module;
}

/** Columns of the module's unitary (straight-line circuits only). */
export function unitaryOf(m: Module, n?: number): StateVector[] {
  const layout = layoutOf(m);
  const size = n ?? layout.numQubits;
  const fixed = { ...layout, numQubits: size };
  return Array.from({ length: 1 << size }, (_, k) => enumeratePaths(m, { initial: StateVector.basis(size, k), layout: fixed })[0].state);
}

/** Compare two lists of columns up to one shared global phase. */
export function sameUpToPhase(a: StateVector[], b: StateVector[], tol = 1e-9): boolean {
  let phase: [number, number] | undefined;
  for (let k = 0; k < a.length; k++) {
    for (let i = 0; i < a[k].re.length; i++) {
      const ar = a[k].re[i], ai = a[k].im[i], br = b[k].re[i], bi = b[k].im[i];
      const am = Math.hypot(ar, ai), bm = Math.hypot(br, bi);
      if (Math.abs(am - bm) > tol) return false;
      if (am < 1e-9) continue;
      // ratio b/a
      const rr = (br * ar + bi * ai) / (am * am);
      const ri = (bi * ar - br * ai) / (am * am);
      if (!phase) phase = [rr, ri];
      else if (Math.abs(rr - phase[0]) > 1e-7 || Math.abs(ri - phase[1]) > 1e-7) return false;
    }
  }
  return true;
}

/** Build reference columns from a function that maps a basis index to a state. */
export function columns(n: number, f: (k: number) => StateVector): StateVector[] {
  return Array.from({ length: 1 << n }, (_, k) => f(k));
}
