// Benchmark suite and ablation study.
//
// Each benchmark is optimized under three configurations:
//   adjacent-only — textual adjacent-pair cancellation (the Review 2 prototype)
//   peephole      — dependence-DAG cancellation + commutation + rotation merging
//   full          — peephole + hybrid constant propagation + CFG simplification
// and measured for gate count, two-qubit count, depth, blocks, compile time,
// correctness (equivalence check) and success rate under simulated noise.

import { EXAMPLES } from './examples';
import { loadProgram } from './index';
import type { Module } from './qir/ir';
import { optimize, PRESETS, type Stats } from './opt/pipeline';
import { randomProgram } from './random';
import { checkEquivalence } from './sim/equiv';
import { DEFAULT_NOISE, layoutOf, type NoiseModel, estimatedSuccess, outputDistribution, sampleShots, SimulationError } from './sim/interp';

export interface Benchmark {
  id: string;
  family: string;
  qubits: number;
  source: string;
}

export interface BenchRow {
  id: string;
  family: string;
  qubits: number;
  before: Stats;
  results: Record<string, { after: Stats; timeMs: number; rewrites: number }>;
  equivalent: boolean | 'skipped';
  /** Success under noise before/after the full pipeline (see `metric`). */
  successBefore?: number;
  successAfter?: number;
  /**
   * 'hellinger': Hellinger fidelity of sampled noisy outputs vs the exact ideal distribution
   *   (equals P(correct answer) for deterministic programs);
   * 'esp': estimated success probability (no error anywhere), used when the output has too
   *   many outcomes to estimate a distribution from samples.
   */
  metric?: 'hellinger' | 'esp';
  /** Whether the external verifier (LLVM) accepted the optimized output, when one ran. */
  llvmVerified?: boolean;
  /** Estimated success probability before/after (always computed). */
  espBefore: number;
  espAfter: number;
}

function cuccaro(bits: number, a: number | 'superposed', b: number): string {
  const lines = [
    'OPENQASM 2.0;', 'include "qelib1.inc";',
    'gate majority a, b, c { cx c, b; cx c, a; ccx a, b, c; }',
    'gate unmaj a, b, c { ccx a, b, c; cx c, a; cx a, b; }',
    'qreg cin[1];', `qreg a[${bits}];`, `qreg b[${bits}];`, 'qreg cout[1];', `creg sum[${bits}];`, 'creg carry[1];',
  ];
  for (let i = 0; i < bits; i++) {
    if (a === 'superposed') {
      if (i < bits - 1) lines.push(`h a[${i}];`);
    } else if ((a >> i) & 1) lines.push(`x a[${i}];`);
    if ((b >> i) & 1) lines.push(`x b[${i}];`);
  }
  lines.push('majority cin[0], b[0], a[0];');
  for (let i = 1; i < bits; i++) lines.push(`majority a[${i - 1}], b[${i}], a[${i}];`);
  lines.push(`cx a[${bits - 1}], cout[0];`);
  for (let i = bits - 1; i >= 1; i--) lines.push(`unmaj a[${i - 1}], b[${i}], a[${i}];`);
  lines.push('unmaj cin[0], b[0], a[0];', 'measure b -> sum;', 'measure cout[0] -> carry[0];');
  return `${lines.join('\n')}\n`;
}

function qftRoundTrip(n: number): string {
  const lines = ['OPENQASM 2.0;', 'include "qelib1.inc";', `qreg q[${n}];`, `creg c[${n}];`];
  for (let i = 0; i < n; i += 2) lines.push(`x q[${i}];`);
  const qft: string[] = [];
  for (let i = 0; i < n; i++) {
    qft.push(`h q[${i}];`);
    for (let j = i + 1; j < n; j++) qft.push(`cu1(pi/${2 ** (j - i)}) q[${j}], q[${i}];`);
  }
  lines.push(...qft);
  // Inverse QFT: reversed order, negated angles.
  lines.push(...[...qft].reverse().map((l) => l.replace('cu1(pi/', 'cu1(-pi/')));
  lines.push('measure q -> c;');
  return `${lines.join('\n')}\n`;
}

export function benchmarkSuite(): Benchmark[] {
  const out: Benchmark[] = [];
  for (const e of EXAMPLES) {
    if (e.id === 'legacy-qir') continue;
    out.push({ id: e.id, family: 'example', qubits: layoutOf(loadProgram(e.source).module).numQubits, source: e.source });
  }
  for (const bits of [3, 5, 7]) {
    out.push({ id: `adder-${bits}bit`, family: 'arithmetic', qubits: 2 * bits + 2, source: cuccaro(bits, (1 << (bits - 1)) - 1, 3) });
    out.push({ id: `adder-${bits}bit-superposed`, family: 'arithmetic', qubits: 2 * bits + 2, source: cuccaro(bits, 'superposed', 3) });
  }
  for (const n of [3, 4, 5]) out.push({ id: `qft-roundtrip-${n}`, family: 'qft', qubits: n, source: qftRoundTrip(n) });
  for (const [n, g] of [[4, 100], [6, 200], [8, 400], [10, 800]] as const) {
    out.push({ id: `random-${n}q-${g}g`, family: 'random', qubits: n, source: randomProgram({ qubits: n, gates: g, seed: n * 1000 + g, redundancy: 0.3 }) });
    out.push({ id: `random-dyn-${n}q-${g}g`, family: 'random', qubits: n, source: randomProgram({ qubits: n, gates: g, seed: n * 7 + g, redundancy: 0.3, dynamic: true }) });
  }
  return out;
}

function hellinger(ideal: Map<string, number>, counts: Map<string, number>, shots: number): number {
  let s = 0;
  for (const [k, p] of ideal) s += Math.sqrt(p * ((counts.get(k) ?? 0) / shots));
  return s * s;
}

export interface BenchOptions {
  shots?: number;
  noise?: NoiseModel;
  /** Skip the noisy simulation (fast mode). */
  noiseless?: boolean;
  maxSimQubits?: number;
  only?: (b: Benchmark) => boolean;
  onRow?: (row: BenchRow) => void;
  /** External verifier for emitted QIR text (e.g. LLVM), when available. */
  verify?: (qir: string) => boolean;
}

export function runBenchmarks(opts: BenchOptions = {}): BenchRow[] {
  const shots = opts.shots ?? 4000;
  const rows: BenchRow[] = [];
  for (const b of benchmarkSuite()) {
    if (opts.only && !opts.only(b)) continue;
    const input: Module = loadProgram(b.source).module;
    const results: BenchRow['results'] = {};
    let full: Module | undefined;
    let fullText = '';
    let before: Stats | undefined;
    for (const [name, preset] of Object.entries(PRESETS)) {
      const r = optimize(input, { ...preset, explain: false });
      before = r.before;
      results[name] = { after: r.after, timeMs: r.timeMs, rewrites: r.rewrites.length };
      if (name === 'full') {
        full = r.module;
        fullText = r.outputText;
      }
    }
    const simulable = b.qubits <= (opts.maxSimQubits ?? 16);
    const eq = simulable ? checkEquivalence(input, full!) : undefined;
    const row: BenchRow = {
      id: b.id, family: b.family, qubits: b.qubits, before: before!, results,
      equivalent: !eq || eq.inconclusive ? 'skipped' : eq.equivalent,
      espBefore: 0,
      espAfter: 0,
    };
    if (opts.verify) row.llvmVerified = opts.verify(fullText);
    const noise = opts.noise ?? DEFAULT_NOISE;
    row.espBefore = estimatedSuccess(input, noise);
    row.espAfter = estimatedSuccess(full!, noise);
    if (simulable && !opts.noiseless) {
      // Exact ideal distribution when the branch count allows, otherwise a large noiseless sample.
      let ideal: Map<string, number>;
      try {
        ideal = outputDistribution(input);
      } catch (e) {
        if (!(e instanceof SimulationError)) throw e;
        const n = shots * 4;
        ideal = new Map([...sampleShots(input, n, { seed: 3 })].map(([k, v]) => [k, v / n]));
      }
      const support = [...ideal.values()].filter((p) => p > 1e-9).length;
      if (support <= shots / 64) {
        row.metric = 'hellinger';
        row.successBefore = hellinger(ideal, sampleShots(input, shots, { seed: 7, noise }), shots);
        row.successAfter = hellinger(ideal, sampleShots(full!, shots, { seed: 7, noise }), shots);
      } else {
        row.metric = 'esp';
        row.successBefore = row.espBefore;
        row.successAfter = row.espAfter;
      }
    }
    rows.push(row);
    opts.onRow?.(row);
  }
  return rows;
}
