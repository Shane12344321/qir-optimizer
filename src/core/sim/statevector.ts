// Dense state-vector simulator. Qubit k corresponds to bit k of the basis index.

import type { GateName } from '../gates';

/** A 2×2 complex matrix [[a, b], [c, d]] stored as (re, im) pairs. */
type M2 = [number, number, number, number, number, number, number, number];

const S2 = Math.SQRT1_2;

function m2(g: GateName, p: number[]): M2 {
  switch (g) {
    case 'h': return [S2, 0, S2, 0, S2, 0, -S2, 0];
    case 'x': return [0, 0, 1, 0, 1, 0, 0, 0];
    case 'y': return [0, 0, 0, -1, 0, 1, 0, 0];
    case 'z': return [1, 0, 0, 0, 0, 0, -1, 0];
    case 's': return [1, 0, 0, 0, 0, 0, 0, 1];
    case 'sdg': return [1, 0, 0, 0, 0, 0, 0, -1];
    case 't': return [1, 0, 0, 0, 0, 0, S2, S2];
    case 'tdg': return [1, 0, 0, 0, 0, 0, S2, -S2];
    case 'rx': {
      const c = Math.cos(p[0] / 2), s = Math.sin(p[0] / 2);
      return [c, 0, 0, -s, 0, -s, c, 0];
    }
    case 'ry': {
      const c = Math.cos(p[0] / 2), s = Math.sin(p[0] / 2);
      return [c, 0, -s, 0, s, 0, c, 0];
    }
    case 'rz': {
      const c = Math.cos(p[0] / 2), s = Math.sin(p[0] / 2);
      return [c, -s, 0, 0, 0, 0, c, s];
    }
    default:
      throw new Error(`not a single-qubit gate: ${g}`);
  }
}

export class StateVector {
  re: Float64Array;
  im: Float64Array;

  constructor(public n: number) {
    this.re = new Float64Array(1 << n);
    this.im = new Float64Array(1 << n);
    this.re[0] = 1;
  }

  static basis(n: number, index: number): StateVector {
    const s = new StateVector(n);
    s.re[0] = 0;
    s.re[index] = 1;
    return s;
  }

  clone(): StateVector {
    const s = new StateVector(this.n);
    s.re.set(this.re);
    s.im.set(this.im);
    return s;
  }

  apply(g: GateName, qubits: number[], params: number[] = []) {
    switch (g) {
      case 'cx': return this.mcx([qubits[0]], qubits[1]);
      case 'ccx': return this.mcx([qubits[0], qubits[1]], qubits[2]);
      case 'cz': return this.cz(qubits[0], qubits[1]);
      case 'swap': return this.swap(qubits[0], qubits[1]);
      default: return this.apply1(qubits[0], m2(g, params));
    }
  }

  private apply1(q: number, m: M2) {
    const [ar, ai, br, bi, cr, ci, dr, di] = m;
    const bit = 1 << q;
    const { re, im } = this;
    for (let i = 0; i < re.length; i++) {
      if (i & bit) continue;
      const j = i | bit;
      const xr = re[i], xi = im[i], yr = re[j], yi = im[j];
      re[i] = ar * xr - ai * xi + br * yr - bi * yi;
      im[i] = ar * xi + ai * xr + br * yi + bi * yr;
      re[j] = cr * xr - ci * xi + dr * yr - di * yi;
      im[j] = cr * xi + ci * xr + dr * yi + di * yr;
    }
  }

  private mcx(controls: number[], t: number) {
    const cmask = controls.reduce((m, c) => m | (1 << c), 0);
    const tbit = 1 << t;
    const { re, im } = this;
    for (let i = 0; i < re.length; i++) {
      if ((i & cmask) !== cmask || i & tbit) continue;
      const j = i | tbit;
      const r = re[i]; re[i] = re[j]; re[j] = r;
      const m = im[i]; im[i] = im[j]; im[j] = m;
    }
  }

  private cz(a: number, b: number) {
    const mask = (1 << a) | (1 << b);
    for (let i = 0; i < this.re.length; i++) {
      if ((i & mask) === mask) {
        this.re[i] = -this.re[i];
        this.im[i] = -this.im[i];
      }
    }
  }

  private swap(a: number, b: number) {
    const ba = 1 << a, bb = 1 << b;
    const { re, im } = this;
    for (let i = 0; i < re.length; i++) {
      if (i & ba && !(i & bb)) {
        const j = (i & ~ba) | bb;
        const r = re[i]; re[i] = re[j]; re[j] = r;
        const m = im[i]; im[i] = im[j]; im[j] = m;
      }
    }
  }

  /** Probability that qubit q reads 1. */
  prob1(q: number): number {
    const bit = 1 << q;
    let p = 0;
    for (let i = 0; i < this.re.length; i++) if (i & bit) p += this.re[i] ** 2 + this.im[i] ** 2;
    return p;
  }

  /** Project qubit q onto `outcome` and renormalise. Returns the probability of that outcome. */
  collapse(q: number, outcome: 0 | 1): number {
    const bit = 1 << q;
    let p = 0;
    for (let i = 0; i < this.re.length; i++) {
      const on = (i & bit) !== 0;
      if (on !== (outcome === 1)) {
        this.re[i] = 0;
        this.im[i] = 0;
      } else {
        p += this.re[i] ** 2 + this.im[i] ** 2;
      }
    }
    if (p > 0) {
      const s = 1 / Math.sqrt(p);
      for (let i = 0; i < this.re.length; i++) {
        this.re[i] *= s;
        this.im[i] *= s;
      }
    }
    return p;
  }

  probabilities(): Float64Array {
    const p = new Float64Array(this.re.length);
    for (let i = 0; i < p.length; i++) p[i] = this.re[i] ** 2 + this.im[i] ** 2;
    return p;
  }
}

/** |⟨a|b⟩|², i.e. fidelity between pure states (insensitive to global phase). */
export function fidelity(a: StateVector, b: StateVector): number {
  let r = 0, i = 0;
  for (let k = 0; k < a.re.length; k++) {
    r += a.re[k] * b.re[k] + a.im[k] * b.im[k];
    i += a.re[k] * b.im[k] - a.im[k] * b.re[k];
  }
  return r * r + i * i;
}

/** ⟨a|b⟩ as [re, im]. */
export function inner(a: StateVector, b: StateVector): [number, number] {
  let r = 0, i = 0;
  for (let k = 0; k < a.re.length; k++) {
    r += a.re[k] * b.re[k] + a.im[k] * b.im[k];
    i += a.re[k] * b.im[k] - a.im[k] * b.re[k];
  }
  return [r, i];
}

/** Bloch vector of qubit q (reduced state), for visualisation. */
export function blochVector(s: StateVector, q: number): [number, number, number] {
  const bit = 1 << q;
  let rho01r = 0, rho01i = 0, p0 = 0, p1 = 0;
  for (let i = 0; i < s.re.length; i++) {
    if (i & bit) continue;
    const j = i | bit;
    p0 += s.re[i] ** 2 + s.im[i] ** 2;
    p1 += s.re[j] ** 2 + s.im[j] ** 2;
    // ρ01 = Σ a_i · conj(a_j)
    rho01r += s.re[i] * s.re[j] + s.im[i] * s.im[j];
    rho01i += s.im[i] * s.re[j] - s.re[i] * s.im[j];
  }
  return [2 * rho01r, -2 * rho01i, p0 - p1];
}
