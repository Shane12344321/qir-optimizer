// QIR interpreter: executes a module on the state-vector simulator, including
// classical control flow on measurement results (Adaptive Profile).
//
// `enumeratePaths` explores every measurement branch exactly (used for
// equivalence checking); `sampleShots` follows one random branch per shot and
// can inject hardware noise (used for success-rate estimates).

import { GATES } from '../gates';
import type { Fn, Instr, Module, Ref, Value } from '../qir/ir';
import { StateVector } from './statevector';

export class SimulationError extends Error {}

const PRUNE = 1e-10;

export interface Layout {
  numQubits: number;
  numResults: number;
  qubitIndex: (r: Ref) => number;
  resultIndex: (r: Ref) => number;
}

/** Pick the function to execute: the entry point, or the first function. */
export function mainFunction(m: Module): Fn {
  const fn = m.functions.find((f) => f.isEntryPoint) ?? m.functions[0];
  if (!fn) throw new SimulationError('module has no functions');
  return fn;
}

export function layoutOf(m: Module): Layout {
  return layoutOfModules([m]);
}

/** One qubit/result numbering covering several modules (so their states can be compared). */
export function layoutOfModules(ms: Module[]): Layout {
  let maxQ = -1;
  let maxR = -1;
  const dynQ = new Map<string, number>();
  const dynR = new Map<string, number>();
  const seeQ = (r: Ref) => {
    if (r.kind === 'static') maxQ = Math.max(maxQ, r.index);
    else if (!dynQ.has(r.name)) dynQ.set(r.name, dynQ.size);
  };
  const seeR = (r: Ref) => {
    if (r.kind === 'static') maxR = Math.max(maxR, r.index);
    else if (!dynR.has(r.name)) dynR.set(r.name, dynR.size);
  };
  for (const b of ms.flatMap((m) => mainFunction(m).blocks)) {
    for (const i of b.instrs) {
      if (i.op === 'gate') i.qubits.forEach(seeQ);
      if (i.op === 'measure') { seeQ(i.qubit); seeR(i.result); }
      if (i.op === 'reset') seeQ(i.qubit);
      if (i.op === 'read_result') seeR(i.result);
      if (i.op === 'record' && i.result) seeR(i.result);
    }
  }
  const trailer = ms.flatMap((m) => m.trailer).join('\n');
  const declared = [...trailer.matchAll(/"required_num_qubits"="(\d+)"/g)].map((x) => Number(x[1]));
  const staticQ = Math.max(maxQ + 1, ...declared);
  const declaredR = [...trailer.matchAll(/"required_num_results"="(\d+)"/g)].map((x) => Number(x[1]));
  const staticR = Math.max(maxR + 1, ...declaredR);
  return {
    numQubits: staticQ + dynQ.size,
    numResults: staticR + dynR.size,
    qubitIndex: (r) => (r.kind === 'static' ? r.index : staticQ + dynQ.get(r.name)!),
    resultIndex: (r) => (r.kind === 'static' ? r.index : staticR + dynR.get(r.name)!),
  };
}

export interface Path {
  prob: number;
  state: StateVector;
  results: Uint8Array;
  /** Sequence of measurement/reset branches taken, e.g. "m0=1;m1=0;". */
  key: string;
}

interface Thread {
  prob: number;
  state: StateVector;
  results: Uint8Array;
  locals: Map<string, number>;
  key: string;
  block: number;
  pc: number;
  steps: number;
}

export interface NoiseModel {
  /** Depolarizing probability after each single-qubit gate. */
  p1: number;
  /** Depolarizing probability after each multi-qubit gate (applied per qubit). */
  p2: number;
  /** Probability a measured bit is read out flipped. */
  readout: number;
}

export const DEFAULT_NOISE: NoiseModel = { p1: 0.002, p2: 0.015, readout: 0.01 };

interface ExecContext {
  fn: Fn;
  layout: Layout;
  labels: Map<string, number>;
  /** When set, measurement picks one outcome at random instead of branching. */
  rng?: () => number;
  noise?: NoiseModel;
}

function evalValue(v: Value, locals: Map<string, number>): number {
  if (v.kind === 'const') return v.value;
  const x = locals.get(v.name);
  if (x === undefined) throw new SimulationError(`use of undefined value ${v.name}`);
  return x;
}

function evalClassical(i: Extract<Instr, { op: 'classical' }>, locals: Map<string, number>): number {
  const a = evalValue(i.operands[0], locals);
  const b = i.operands[1] ? evalValue(i.operands[1], locals) : 0;
  return foldClassical(i.opcode, i.pred, a, b);
}

/** Shared by the interpreter and the constant folder so both agree exactly. */
export function foldClassical(opcode: string, pred: string | undefined, a: number, b: number): number {
  switch (opcode) {
    case 'zext': return a;
    case 'shl': return a * 2 ** b;
    case 'or': return Number(BigInt(a) | BigInt(b));
    case 'and': return Number(BigInt(a) & BigInt(b));
    case 'xor': return Number(BigInt(a) ^ BigInt(b));
    case 'add': return a + b;
    case 'sub': return a - b;
    case 'icmp':
      switch (pred) {
        case 'eq': return a === b ? 1 : 0;
        case 'ne': return a !== b ? 1 : 0;
        case 'ult': case 'slt': return a < b ? 1 : 0;
        case 'ugt': case 'sgt': return a > b ? 1 : 0;
        case 'ule': case 'sle': return a <= b ? 1 : 0;
        case 'uge': case 'sge': return a >= b ? 1 : 0;
      }
  }
  throw new SimulationError(`cannot evaluate ${opcode}${pred ? ` ${pred}` : ''}`);
}

const PAULIS = ['x', 'y', 'z'] as const;

function applyNoise(t: Thread, qubits: number[], ctx: ExecContext) {
  const noise = ctx.noise!;
  const p = qubits.length > 1 ? noise.p2 : noise.p1;
  for (const q of qubits) {
    if (ctx.rng!() < p) t.state.apply(PAULIS[Math.floor(ctx.rng!() * 3)], [q]);
  }
}

/** Run a thread until it finishes or forks. Returns forked threads (empty when finished). */
function step(t: Thread, ctx: ExecContext): Thread[] | 'done' {
  const { fn, layout } = ctx;
  for (;;) {
    if (++t.steps > 1_000_000) throw new SimulationError('execution step limit exceeded (infinite loop?)');
    const block = fn.blocks[t.block];
    const i = block.instrs[t.pc++];
    if (!i) throw new SimulationError(`block '${block.label}' has no terminator`);
    switch (i.op) {
      case 'gate': {
        const qs = i.qubits.map(layout.qubitIndex);
        t.state.apply(i.gate, qs, i.params);
        if (ctx.noise) applyNoise(t, qs, ctx);
        break;
      }
      case 'measure':
      case 'reset': {
        const q = layout.qubitIndex(i.qubit);
        const p1 = t.state.prob1(q);
        const p0 = 1 - p1;
        const outcomes: (0 | 1)[] = [];
        if (p0 > PRUNE) outcomes.push(0);
        if (p1 > PRUNE) outcomes.push(1);
        const tag = i.op === 'measure' ? `m${layout.resultIndex(i.result)}` : `r${q}`;
        const settle = (th: Thread, o: 0 | 1, p: number, branching: boolean) => {
          th.state.collapse(q, o);
          th.prob *= p;
          if (branching) th.key += `${tag}=${o};`;
          if (i.op === 'measure') {
            let bit: number = o;
            if (ctx.noise && ctx.rng!() < ctx.noise.readout) bit ^= 1;
            th.results[layout.resultIndex(i.result)] = bit;
          } else if (o === 1) {
            th.state.apply('x', [q]);
          }
        };
        if (ctx.rng) {
          const o: 0 | 1 = ctx.rng() < p1 ? 1 : 0;
          settle(t, o, 1, false);
          break;
        }
        if (outcomes.length === 1) {
          settle(t, outcomes[0], 1, false);
          break;
        }
        const forks = outcomes.map((o) => {
          const th: Thread = { ...t, state: t.state.clone(), results: t.results.slice(), locals: new Map(t.locals) };
          settle(th, o, o === 1 ? p1 : p0, true);
          return th;
        });
        return forks;
      }
      case 'read_result':
        t.locals.set(i.dest, t.results[layout.resultIndex(i.result)] ?? 0);
        break;
      case 'classical':
        t.locals.set(i.dest, evalClassical(i, t.locals));
        break;
      case 'record':
        break;
      case 'br': {
        const target = i.cond === undefined || evalValue(i.cond, t.locals) ? i.ifTrue : i.ifFalse!;
        const idx = ctx.labels.get(target);
        if (idx === undefined) throw new SimulationError(`branch to unknown label '${target}'`);
        t.block = idx;
        t.pc = 0;
        break;
      }
      case 'ret':
        return 'done';
      case 'opaque':
        if (i.callee === '__quantum__qis__barrier__body') break;
        throw new SimulationError(`cannot simulate opaque instruction: ${i.text}`);
    }
  }
}

function context(m: Module, extra: Partial<ExecContext> = {}): ExecContext {
  const fn = mainFunction(m);
  return {
    fn,
    layout: layoutOf(m),
    labels: new Map(fn.blocks.map((b, k) => [b.label, k])),
    ...extra,
  };
}

function freshThread(ctx: ExecContext, initial?: StateVector): Thread {
  return {
    prob: 1,
    state: initial ? initial.clone() : new StateVector(ctx.layout.numQubits),
    results: new Uint8Array(ctx.layout.numResults),
    locals: new Map(),
    key: '',
    block: 0,
    pc: 0,
    steps: 0,
  };
}

export const MAX_SIM_QUBITS = 22;

/** Explore every measurement branch. Exact, exponential in the number of branching measurements. */
export function enumeratePaths(m: Module, opts: { initial?: StateVector; maxPaths?: number; layout?: Layout } = {}): Path[] {
  const ctx = context(m);
  if (opts.layout) ctx.layout = opts.layout;
  if (ctx.layout.numQubits > MAX_SIM_QUBITS) throw new SimulationError(`too many qubits to simulate (${ctx.layout.numQubits})`);
  const maxPaths = opts.maxPaths ?? 4096;
  const todo: Thread[] = [freshThread(ctx, opts.initial)];
  const done: Path[] = [];
  while (todo.length) {
    const t = todo.pop()!;
    const r = step(t, ctx);
    if (r === 'done') {
      done.push({ prob: t.prob, state: t.state, results: t.results, key: t.key });
    } else {
      todo.push(...r);
      if (todo.length + done.length > maxPaths) throw new SimulationError(`more than ${maxPaths} measurement branches`);
    }
  }
  return done;
}

/** Deterministic PRNG so runs are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface OutputSpec {
  /** Result indices per recorded register, in record order. */
  registers: number[][];
}

/** Read the output layout from the `*_record_output` calls (falls back to all results). */
export function outputSpec(m: Module): OutputSpec {
  const fn = mainFunction(m);
  const layout = layoutOf(m);
  const registers: number[][] = [];
  let current: number[] | undefined;
  for (const b of fn.blocks) {
    for (const i of b.instrs) {
      if (i.op !== 'record') continue;
      if (i.callee === '__quantum__rt__array_record_output') {
        current = [];
        registers.push(current);
      } else if (i.callee === '__quantum__rt__result_record_output' && i.result) {
        if (!current) {
          current = [];
          registers.push(current);
        }
        current.push(layout.resultIndex(i.result));
      }
    }
  }
  if (!registers.length) registers.push(Array.from({ length: layout.numResults }, (_, k) => k));
  return { registers };
}

/** Format results as bitstrings, most significant bit first, one group per register. */
export function formatOutput(results: Uint8Array, spec: OutputSpec): string {
  return spec.registers.map((reg) => [...reg].reverse().map((k) => results[k] ?? 0).join('')).join(' ');
}

/** Exact output distribution (no noise). */
export function outputDistribution(m: Module): Map<string, number> {
  const spec = outputSpec(m);
  const dist = new Map<string, number>();
  for (const p of enumeratePaths(m)) {
    const k = formatOutput(p.results, spec);
    dist.set(k, (dist.get(k) ?? 0) + p.prob);
  }
  return dist;
}

/** Monte-Carlo shots, optionally with noise. */
export function sampleShots(m: Module, shots: number, opts: { seed?: number; noise?: NoiseModel } = {}): Map<string, number> {
  const rng = mulberry32(opts.seed ?? 1);
  const ctx = context(m, { rng, noise: opts.noise });
  if (ctx.layout.numQubits > MAX_SIM_QUBITS) throw new SimulationError(`too many qubits to simulate (${ctx.layout.numQubits})`);
  const spec = outputSpec(m);
  const counts = new Map<string, number>();
  for (let s = 0; s < shots; s++) {
    const t = freshThread(ctx);
    const r = step(t, ctx);
    if (r !== 'done') throw new SimulationError('unexpected fork while sampling');
    const k = formatOutput(t.results, spec);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/**
 * Estimated success probability (ESP): the probability that a run sees no
 * error at all under the noise model — the product of (1 − p) over every gate
 * and measurement on the executed path. A standard figure of merit in
 * noise-aware compilation; exact and cheap, so it works at any size.
 */
export function estimatedSuccess(m: Module, noise: NoiseModel = DEFAULT_NOISE): number {
  let logp = 0;
  for (const f of m.functions) {
    for (const b of f.blocks) {
      for (const i of b.instrs) {
        if (i.op === 'gate') {
          const k = GATES[i.gate].qubits;
          logp += k * Math.log1p(-(k > 1 ? noise.p2 : noise.p1));
        } else if (i.op === 'measure') {
          logp += Math.log1p(-noise.readout);
        }
      }
    }
  }
  return Math.exp(logp);
}

/** Count gates for cost metrics. */
export function gateStats(m: Module): { total: number; twoQubit: number; depth: number } {
  let total = 0;
  let twoQubit = 0;
  let depth = 0;
  for (const f of m.functions) {
    for (const b of f.blocks) {
      const level = new Map<string, number>();
      for (const i of b.instrs) {
        if (i.op !== 'gate' && i.op !== 'measure' && i.op !== 'reset') continue;
        const qs = i.op === 'gate' ? i.qubits : [i.qubit];
        const keys = qs.map((q) => (q.kind === 'static' ? `s${q.index}` : q.name));
        const l = Math.max(0, ...keys.map((k) => level.get(k) ?? 0)) + 1;
        keys.forEach((k) => level.set(k, l));
        if (i.op === 'gate') {
          total++;
          if (GATES[i.gate].qubits > 1) twoQubit++;
        }
      }
      depth += Math.max(0, ...level.values());
    }
  }
  return { total, twoQubit, depth };
}
