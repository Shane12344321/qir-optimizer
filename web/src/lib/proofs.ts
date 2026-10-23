// In-browser re-run of the rule soundness checks from tests/rules.test.ts:
// every pair of native gates, every placement on three qubits.

import { commutes, compileQasm, enumeratePaths, GATE_NAMES, GATES, type GateInstr, type GateName, isInversePair, layoutOf, type Module, StateVector } from '@core';

const N = 3;
const PARAM = 0.7;

function placements(arity: number): number[][] {
  const out: number[][] = [];
  const rec = (cur: number[]) => {
    if (cur.length === arity) return void out.push([...cur]);
    for (let q = 0; q < N; q++) if (!cur.includes(q)) rec([...cur, q]);
  };
  rec([]);
  return out;
}

const instr = (g: GateName, qs: number[]): GateInstr => ({ op: 'gate', id: 0, gate: g, qubits: qs.map((index) => ({ kind: 'static', index })), params: GATES[g].params ? [PARAM] : [] });
const stmt = (g: GateName, qs: number[]) => `${g}${GATES[g].params ? `(${PARAM})` : ''} ${qs.map((q) => `q[${q}]`).join(', ')};\n`;
const prog = (body: string) => compileQasm(`OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[${N}];\n${body}`).module;

function unitary(m: Module): StateVector[] {
  const layout = { ...layoutOf(m), numQubits: N };
  return Array.from({ length: 1 << N }, (_, k) => enumeratePaths(m, { initial: StateVector.basis(N, k), layout })[0].state);
}

function samePhase(a: StateVector[], b: StateVector[]): boolean {
  let ph: [number, number] | undefined;
  for (let k = 0; k < a.length; k++) {
    for (let i = 0; i < a[k].re.length; i++) {
      const ar = a[k].re[i], ai = a[k].im[i], br = b[k].re[i], bi = b[k].im[i];
      const am = ar * ar + ai * ai;
      if (Math.abs(Math.sqrt(am) - Math.hypot(br, bi)) > 1e-9) return false;
      if (am < 1e-18) continue;
      const rr = (br * ar + bi * ai) / am, ri = (bi * ar - br * ai) / am;
      if (!ph) ph = [rr, ri];
      else if (Math.abs(rr - ph[0]) > 1e-7 || Math.abs(ri - ph[1]) > 1e-7) return false;
    }
  }
  return true;
}

export interface ProofReport {
  pairsExamined: number;
  commuteClaims: number;
  commuteVerified: number;
  inverseClaims: number;
  inverseVerified: number;
  ms: number;
}

const ALL = GATE_NAMES.flatMap((g) => placements(GATES[g].qubits).map((qs) => [g, qs] as const));

/** Runs incrementally so the page stays responsive; reports progress. */
export async function proveRules(onProgress: (r: ProofReport) => void): Promise<ProofReport> {
  const t0 = performance.now();
  const r: ProofReport = { pairsExamined: 0, commuteClaims: 0, commuteVerified: 0, inverseClaims: 0, inverseVerified: 0, ms: 0 };
  const identity = Array.from({ length: 1 << N }, (_, k) => StateVector.basis(N, k));
  const cache = new Map<string, StateVector[]>();
  const u = (body: string) => {
    let v = cache.get(body);
    if (!v) cache.set(body, (v = unitary(prog(body))));
    return v;
  };
  for (let i = 0; i < ALL.length; i++) {
    const [ga, qa] = ALL[i];
    for (const [gb, qb] of ALL) {
      r.pairsExamined++;
      const a = instr(ga, qa), b = instr(gb, qb);
      if (commutes(a, b)) {
        r.commuteClaims++;
        if (samePhase(u(stmt(ga, qa) + stmt(gb, qb)), u(stmt(gb, qb) + stmt(ga, qa)))) r.commuteVerified++;
      }
      if (isInversePair(a, b)) {
        r.inverseClaims++;
        if (samePhase(u(stmt(ga, qa) + stmt(gb, qb)), identity)) r.inverseVerified++;
      }
    }
    if (i % 4 === 3) {
      r.ms = performance.now() - t0;
      onProgress({ ...r });
      await new Promise((res) => setTimeout(res, 0));
    }
  }
  r.ms = performance.now() - t0;
  onProgress({ ...r });
  return r;
}
