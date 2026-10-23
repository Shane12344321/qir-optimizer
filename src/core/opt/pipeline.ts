// Pass manager: runs the passes in a loop until a fixed point, records a trace
// of every rewrite (with optional snapshots for step-by-step replay), and can
// validate each rewrite with the equivalence checker (translation validation).

import { emitModule } from '../qir/emitter';
import { cloneModule, type Module } from '../qir/ir';
import { checkEquivalence, type EquivResult } from '../sim/equiv';
import { gateStats } from '../sim/interp';
import { simplifyCfg } from './cfg';
import { peephole } from './peephole';
import { lowerProfile } from './profile';
import { quantumConstProp } from './qconst';
import type { RefusalEvent, RewriteEvent, TraceEvent } from './trace';

export interface OptimizeOptions {
  cancel?: boolean;
  commute?: boolean;
  merge?: boolean;
  qconst?: boolean;
  cfg?: boolean;
  /** Record refusal explanations (cheap, on by default). */
  explain?: boolean;
  /** Keep a module snapshot after every rewrite (for replay in the Studio). */
  snapshots?: boolean;
  /** 'each': validate every rewrite; 'final': validate input vs output; 'none'. */
  validate?: 'none' | 'final' | 'each';
  maxIterations?: number;
}

export const ALL_PASSES: Required<Pick<OptimizeOptions, 'cancel' | 'commute' | 'merge' | 'qconst' | 'cfg'>> = {
  cancel: true, commute: true, merge: true, qconst: true, cfg: true,
};

/** Presets used for the ablation study. */
export const PRESETS: Record<string, Partial<OptimizeOptions>> = {
  'adjacent-only': { cancel: true, commute: false, merge: false, qconst: false, cfg: false },
  peephole: { cancel: true, commute: true, merge: true, qconst: false, cfg: false },
  full: { ...ALL_PASSES },
};

export interface Snapshot {
  event: RewriteEvent;
  text: string;
  module: Module;
}

export interface Stats {
  gates: number;
  twoQubit: number;
  depth: number;
  blocks: number;
}

export interface OptimizeResult {
  module: Module;
  events: TraceEvent[];
  rewrites: RewriteEvent[];
  refusals: RefusalEvent[];
  snapshots: Snapshot[];
  iterations: number;
  before: Stats;
  after: Stats;
  validation?: EquivResult;
  timeMs: number;
  inputText: string;
  outputText: string;
}

export function stats(m: Module): Stats {
  const g = gateStats(m);
  return { gates: g.total, twoQubit: g.twoQubit, depth: g.depth, blocks: m.functions.reduce((n, f) => n + f.blocks.length, 0) };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function optimize(input: Module, options: OptimizeOptions = {}): OptimizeResult {
  const opts = { ...ALL_PASSES, explain: true, snapshots: false, validate: 'none' as const, maxIterations: 32, ...options };
  const t0 = now();
  const module = cloneModule(input);
  const events: TraceEvent[] = [];
  const snapshots: Snapshot[] = [];
  const seenRefusals = new Set<string>();

  const first = emitModule(input);
  let prevLines = first.lineOf;
  let prevModule = cloneModule(input);
  const srcLineOf = new Map<number, number | undefined>();
  const indexSrc = (m: Module) => {
    for (const f of m.functions) for (const b of f.blocks) for (const i of b.instrs) srcLineOf.set(i.id, i.srcLine);
  };
  indexSrc(input);

  const emit = (e: TraceEvent) => {
    if (e.kind === 'refusal') {
      const key = `${e.rule}:${e.ids.join(',')}:${e.reason}`;
      if (seenRefusals.has(key)) return;
      seenRefusals.add(key);
      e.linesBefore = e.ids.map((id) => prevLines.get(id)).filter((x): x is number => x !== undefined);
      e.srcLines = e.ids.map((id) => srcLineOf.get(id)).filter((x): x is number => x !== undefined);
      events.push(e);
      return;
    }
    indexSrc(module);
    e.linesBefore = [...e.removed, ...e.changed].map((id) => prevLines.get(id)).filter((x): x is number => x !== undefined);
    e.srcLines = [...new Set([...e.removed, ...e.changed, ...e.added].map((id) => srcLineOf.get(id)).filter((x): x is number => x !== undefined))];
    if (opts.snapshots || opts.validate === 'each') {
      const out = emitModule(module);
      e.linesAfter = [...e.changed, ...e.added].map((id) => out.lineOf.get(id)).filter((x): x is number => x !== undefined);
      const snap = cloneModule(module);
      if (opts.validate === 'each') {
        const v = checkEquivalence(prevModule, snap);
        e.validated = { equivalent: v.equivalent, fidelity: v.fidelity };
      }
      if (opts.snapshots) snapshots.push({ event: e, text: out.text, module: snap });
      prevLines = out.lineOf;
      prevModule = snap;
    }
    events.push(e);
  };

  let iterations = 0;
  for (; iterations < opts.maxIterations; iterations++) {
    let changed = false;
    for (const fn of module.functions) {
      if (opts.qconst) changed = quantumConstProp(fn, emit, opts.explain) || changed;
      if (opts.cfg) changed = simplifyCfg(fn, emit) || changed;
      if (opts.cancel || opts.merge) {
        changed = peephole(fn, { cancel: opts.cancel, commute: opts.commute, merge: opts.merge, explain: opts.explain }, emit) || changed;
      }
    }
    if (!changed) break;
  }
  if (opts.cfg && opts.qconst) lowerProfile(module, emit);

  // Refusals that a later rewrite made moot (both instructions gone) are noise; drop them.
  const alive = new Set<number>();
  for (const f of module.functions) for (const b of f.blocks) for (const i of b.instrs) alive.add(i.id);
  const finalEvents = events.filter((e) => e.kind === 'rewrite' || e.ids.every((id) => alive.has(id)));

  const outputText = emitModule(module).text;
  const result: OptimizeResult = {
    module,
    events: finalEvents,
    rewrites: finalEvents.filter((e): e is RewriteEvent => e.kind === 'rewrite'),
    refusals: finalEvents.filter((e): e is RefusalEvent => e.kind === 'refusal'),
    snapshots,
    iterations: iterations + 1,
    before: stats(input),
    after: stats(module),
    timeMs: 0,
    inputText: first.text,
    outputText,
  };
  if (opts.validate !== 'none') result.validation = checkEquivalence(input, module);
  result.timeMs = now() - t0;
  return result;
}
