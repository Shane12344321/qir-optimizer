// The native gate set shared by every stage of the compiler.
//
// Each gate records how many qubits and parameters it takes, how it inverts,
// and — per qubit — which "basis" it acts in. The basis tags drive the
// commutation rules used by the optimizer (see `commutes`).

export type GateName =
  | 'h' | 'x' | 'y' | 'z'
  | 's' | 'sdg' | 't' | 'tdg'
  | 'rx' | 'ry' | 'rz'
  | 'cx' | 'cz' | 'swap' | 'ccx';

/** How a gate acts on one of its wires, for commutation analysis. */
export type WireBasis = 'Z' | 'X' | 'Y' | 'none';

export interface GateInfo {
  name: GateName;
  qubits: number;
  params: number;
  /** Per-wire basis. Two gates commute if, on every shared wire, they share a non-'none' basis. */
  wires: WireBasis[];
  /** The adjoint gate name, when the adjoint is another fixed gate. */
  inverse?: GateName;
  /** Rotation axis for parameterised single-qubit gates. */
  axis?: 'x' | 'y' | 'z';
  /** Phase in units of π/4 for diagonal Clifford+T gates (rz up to global phase). */
  phaseEighths?: number;
  /** Qubit operands that can be permuted without changing the gate (e.g. both wires of CZ). */
  symmetric?: number[][];
  /** Permutes computational basis states (used by constant propagation). */
  classical?: boolean;
}

export const GATES: Record<GateName, GateInfo> = {
  h: { name: 'h', qubits: 1, params: 0, wires: ['none'], inverse: 'h' },
  x: { name: 'x', qubits: 1, params: 0, wires: ['X'], inverse: 'x', classical: true },
  y: { name: 'y', qubits: 1, params: 0, wires: ['Y'], inverse: 'y', classical: true },
  z: { name: 'z', qubits: 1, params: 0, wires: ['Z'], inverse: 'z', phaseEighths: 4 },
  s: { name: 's', qubits: 1, params: 0, wires: ['Z'], inverse: 'sdg', phaseEighths: 2 },
  sdg: { name: 'sdg', qubits: 1, params: 0, wires: ['Z'], inverse: 's', phaseEighths: 6 },
  t: { name: 't', qubits: 1, params: 0, wires: ['Z'], inverse: 'tdg', phaseEighths: 1 },
  tdg: { name: 'tdg', qubits: 1, params: 0, wires: ['Z'], inverse: 't', phaseEighths: 7 },
  rx: { name: 'rx', qubits: 1, params: 1, wires: ['X'], axis: 'x' },
  ry: { name: 'ry', qubits: 1, params: 1, wires: ['Y'], axis: 'y' },
  rz: { name: 'rz', qubits: 1, params: 1, wires: ['Z'], axis: 'z' },
  cx: { name: 'cx', qubits: 2, params: 0, wires: ['Z', 'X'], inverse: 'cx', classical: true },
  cz: { name: 'cz', qubits: 2, params: 0, wires: ['Z', 'Z'], inverse: 'cz', symmetric: [[0, 1]] },
  swap: { name: 'swap', qubits: 2, params: 0, wires: ['none', 'none'], inverse: 'swap', symmetric: [[0, 1]], classical: true },
  ccx: { name: 'ccx', qubits: 3, params: 0, wires: ['Z', 'Z', 'X'], inverse: 'ccx', symmetric: [[0, 1]], classical: true },
};

export const GATE_NAMES = Object.keys(GATES) as GateName[];

export function isGateName(name: string): name is GateName {
  return Object.prototype.hasOwnProperty.call(GATES, name);
}

export function isTwoQubitOrMore(g: GateName): boolean {
  return GATES[g].qubits >= 2;
}

/** Gates that are diagonal in the computational basis on every wire. */
export function isDiagonal(g: GateName): boolean {
  return GATES[g].wires.every((w) => w === 'Z');
}

const TWO_PI = 2 * Math.PI;

/** Normalise an angle into (-π, π]. */
export function normAngle(a: number): number {
  let r = a % TWO_PI;
  if (r <= -Math.PI) r += TWO_PI;
  if (r > Math.PI) r -= TWO_PI;
  return r;
}

export const ANGLE_EPS = 1e-10;

export function isZeroAngle(a: number): boolean {
  return Math.abs(normAngle(a)) < ANGLE_EPS;
}

/** Map a phase (units of π/4, mod 8) back to the cheapest named gate, or undefined for identity. */
export function gateForPhaseEighths(k: number): GateName | 'identity' | undefined {
  switch (((k % 8) + 8) % 8) {
    case 0: return 'identity';
    case 1: return 't';
    case 2: return 's';
    case 4: return 'z';
    case 6: return 'sdg';
    case 7: return 'tdg';
    default: return undefined; // 3π/4 and 5π/4 have no single named gate
  }
}

/** Pretty-print an angle as a multiple of π where possible ("π/4", "-3π/2", "0.3172"). */
export function formatAngle(a: number): string {
  if (Math.abs(a) < ANGLE_EPS) return '0';
  const ratio = a / Math.PI;
  for (const den of [1, 2, 3, 4, 6, 8, 16, 32, 64]) {
    const num = ratio * den;
    if (Math.abs(num - Math.round(num)) < 1e-9) {
      const n = Math.round(num);
      const sign = n < 0 ? '-' : '';
      const absN = Math.abs(n);
      const top = absN === 1 ? 'π' : `${absN}π`;
      return den === 1 ? `${sign}${top}` : `${sign}${top}/${den}`;
    }
  }
  return a.toFixed(4);
}

/** Short label used in circuit diagrams. */
export function gateLabel(g: GateName, params: number[] = []): string {
  const base: Record<GateName, string> = {
    h: 'H', x: 'X', y: 'Y', z: 'Z', s: 'S', sdg: 'S†', t: 'T', tdg: 'T†',
    rx: 'Rx', ry: 'Ry', rz: 'Rz', cx: 'CX', cz: 'CZ', swap: 'SWAP', ccx: 'CCX',
  };
  return params.length ? `${base[g]}(${params.map(formatAngle).join(',')})` : base[g];
}
