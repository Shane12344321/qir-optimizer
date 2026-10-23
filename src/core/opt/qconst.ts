// Hybrid quantum–classical constant propagation.
//
// A forward dataflow analysis over the control-flow graph tracks, for every
// qubit, whether it is definitely |0⟩, definitely |1⟩, or unknown (⊤) — the
// classic constant-propagation lattice, applied to qubits. Measurement results
// and classical SSA values are tracked in the same state, so knowledge flows
// across the quantum→classical boundary:
//
//   qubit known |0⟩ ─► measurement is deterministic ─► read_result is a constant
//   ─► icmp folds ─► the branch folds ─► the other block becomes unreachable.
//
// Branches whose condition is known only propagate along the taken edge, as in
// sparse conditional constant propagation (Wegman & Zadeck).

import { gateLabel, isDiagonal } from '../gates';
import { foldClassical } from '../sim/interp';
import {
  type Block, type Fn, freshId, type GateInstr, type Instr, qubitName, type Ref, resultName, type Value,
} from '../qir/ir';
import type { Emit, RuleId } from './trace';

/** Lattice value for one qubit or result. */
export type QVal = 0 | 1 | 'T';
type LVal = number | 'T';

export interface AState {
  q: QVal[]; // static qubits
  r: QVal[]; // static results
  /** Value used for static indices beyond the arrays (grown lazily). */
  qDefault: QVal;
  locals: Map<string, LVal>;
}

const joinV = <T>(a: T, b: T): T | 'T' => (a === b ? a : 'T');

function getQ(s: AState, r: Ref): QVal {
  if (r.kind !== 'static') return 'T';
  return r.index < s.q.length ? s.q[r.index] : s.qDefault;
}

function setQ(s: AState, r: Ref, v: QVal) {
  if (r.kind !== 'static') {
    // An SSA qubit may alias any static one: forget everything.
    s.q = s.q.map(() => 'T');
    s.qDefault = 'T';
    return;
  }
  while (s.q.length <= r.index) s.q.push(s.qDefault);
  s.q[r.index] = v;
}

function getR(s: AState, r: Ref): QVal {
  if (r.kind !== 'static') return 'T';
  return s.r[r.index] ?? 'T';
}

function setR(s: AState, r: Ref, v: QVal) {
  if (r.kind !== 'static') {
    s.r = s.r.map(() => 'T');
    return;
  }
  while (s.r.length <= r.index) s.r.push('T');
  s.r[r.index] = v;
}

function cloneState(s: AState): AState {
  return { q: [...s.q], r: [...s.r], qDefault: s.qDefault, locals: new Map(s.locals) };
}

function join(a: AState, b: AState): AState {
  const n = Math.max(a.q.length, b.q.length);
  const q: QVal[] = [];
  for (let i = 0; i < n; i++) q.push(joinV(a.q[i] ?? a.qDefault, b.q[i] ?? b.qDefault));
  const m = Math.max(a.r.length, b.r.length);
  const r: QVal[] = [];
  for (let i = 0; i < m; i++) r.push(joinV(a.r[i] ?? 'T', b.r[i] ?? 'T'));
  const locals = new Map<string, LVal>();
  for (const [k, v] of a.locals) if (b.locals.has(k)) locals.set(k, joinV(v, b.locals.get(k)!));
  return { q, r, qDefault: joinV(a.qDefault, b.qDefault), locals };
}

function sameState(a: AState, b: AState): boolean {
  if (a.qDefault !== b.qDefault || a.q.length !== b.q.length || a.r.length !== b.r.length) return false;
  if (a.q.some((v, i) => v !== b.q[i]) || a.r.some((v, i) => v !== b.r[i])) return false;
  if (a.locals.size !== b.locals.size) return false;
  for (const [k, v] of a.locals) if (b.locals.get(k) !== v) return false;
  return true;
}

function valueOf(v: Value, s: AState): LVal {
  return v.kind === 'const' ? v.value : (s.locals.get(v.name) ?? 'T');
}

function flip(v: QVal): QVal {
  return v === 'T' ? 'T' : v === 0 ? 1 : 0;
}

/** Abstract transfer function for one instruction. */
export function transfer(i: Instr, s: AState) {
  switch (i.op) {
    case 'gate': {
      if (i.qubits.some((q) => q.kind !== 'static')) {
        setQ(s, i.qubits.find((q) => q.kind !== 'static')!, 'T');
        return;
      }
      const v = i.qubits.map((q) => getQ(s, q));
      switch (i.gate) {
        case 'x':
        case 'y':
          setQ(s, i.qubits[0], flip(v[0]));
          return;
        case 'h':
        case 'rx':
        case 'ry':
          setQ(s, i.qubits[0], 'T');
          return;
        case 'cx':
          if (v[0] === 1) setQ(s, i.qubits[1], flip(v[1]));
          else if (v[0] === 'T') setQ(s, i.qubits[1], 'T');
          return;
        case 'ccx':
          if (v[0] === 0 || v[1] === 0) return;
          if (v[0] === 1 && v[1] === 1) setQ(s, i.qubits[2], flip(v[2]));
          else setQ(s, i.qubits[2], 'T');
          return;
        case 'swap':
          setQ(s, i.qubits[0], v[1]);
          setQ(s, i.qubits[1], v[0]);
          return;
        default:
          // Diagonal gates (Z, S, T, Rz, CZ) only change phases: basis-state knowledge survives.
          return;
      }
    }
    case 'measure':
      setR(s, i.result, getQ(s, i.qubit));
      return;
    case 'reset':
      setQ(s, i.qubit, 0);
      return;
    case 'read_result': {
      const v = getR(s, i.result);
      s.locals.set(i.dest, v);
      return;
    }
    case 'classical': {
      const ops = i.operands.map((o) => valueOf(o, s));
      s.locals.set(i.dest, ops.some((o) => o === 'T') ? 'T' : foldClassical(i.opcode, i.pred, ops[0] as number, (ops[1] ?? 0) as number));
      return;
    }
    case 'opaque':
      if (i.isCall) {
        s.q = s.q.map(() => 'T');
        s.qDefault = 'T';
        s.r = s.r.map(() => 'T');
      }
      if (i.dest) s.locals.set(i.dest, 'T');
      return;
    default:
      return;
  }
}

function successors(b: Block, s: AState): string[] {
  const t = b.instrs[b.instrs.length - 1];
  if (!t || t.op !== 'br') return [];
  if (!t.cond) return [t.ifTrue];
  const c = valueOf(t.cond, s);
  if (c === 'T') return [t.ifTrue, t.ifFalse!];
  return [c ? t.ifTrue : t.ifFalse!];
}

export interface Analysis {
  /** State on entry to each reachable block. Unreachable blocks are absent. */
  inStates: Map<string, AState>;
}

export function analyze(fn: Fn): Analysis {
  const entry: AState = { q: [], r: [], qDefault: fn.isEntryPoint ? 0 : 'T', locals: new Map() };
  const inStates = new Map<string, AState>([[fn.blocks[0].label, entry]]);
  const byLabel = new Map(fn.blocks.map((b) => [b.label, b]));
  const work = [fn.blocks[0].label];
  let guard = 0;
  while (work.length && guard++ < 10_000) {
    const label = work.shift()!;
    const block = byLabel.get(label);
    if (!block) continue;
    const s = cloneState(inStates.get(label)!);
    for (const i of block.instrs) transfer(i, s);
    for (const succ of successors(block, s)) {
      const old = inStates.get(succ);
      const next = old ? join(old, s) : cloneState(s);
      if (!old || !sameState(old, next)) {
        inStates.set(succ, next);
        if (!work.includes(succ)) work.push(succ);
      }
    }
  }
  return { inStates };
}

const nameRe = (name: string) => new RegExp(`${name.replace(/[.$]/g, '\\$&')}(?![-A-Za-z$._0-9])`);

/** Replace every use of an SSA value with a constant. Returns false if an opaque instruction uses it. */
function substitute(fn: Fn, name: string, value: number, type: string): boolean {
  const re = nameRe(name);
  for (const b of fn.blocks) for (const i of b.instrs) if (i.op === 'opaque' && re.test(i.text)) return false;
  for (const b of fn.blocks) {
    for (const i of b.instrs) {
      if (i.op === 'classical') {
        i.operands = i.operands.map((o) => (o.kind === 'local' && o.name === name ? { kind: 'const', type: o.type, value } : o));
      }
      if (i.op === 'br' && i.cond?.kind === 'local' && i.cond.name === name) i.cond = { kind: 'const', type, value };
    }
  }
  return true;
}

const ket = (v: QVal) => (v === 'T' ? '?' : `|${v}⟩`);

/** Apply constant-propagation rewrites. Returns true if anything changed. */
export function quantumConstProp(fn: Fn, emit: Emit, explain = true): boolean {
  const qname = (r: Ref) => qubitName(fn, r);
  const { inStates } = analyze(fn);
  let changed = false;

  for (const block of fn.blocks) {
    const inState = inStates.get(block.label);
    if (!inState) continue; // unreachable: left for the CFG pass
    const s = cloneState(inState);
    const out: Instr[] = [];
    const ev = (rule: RuleId, removed: number[], changedIds: number[], added: number[], message: string) => {
      emit({ kind: 'rewrite', rule, fn: fn.name, block: block.label, removed, changed: changedIds, added, message });
      changed = true;
    };

    for (let idx = 0; idx < block.instrs.length; idx++) {
      const i = block.instrs[idx];
      if (i.op === 'gate' && i.qubits.every((q) => q.kind === 'static')) {
        const v = i.qubits.map((q) => getQ(s, q));
        const rewritten = rewriteGate(i, v, qname);
        if (rewritten) {
          const desc = `${gateLabel(i.gate, i.params)} on ${i.qubits.map(qname).join(', ')}`;
          if (rewritten.replacement.length === 0) {
            ev(rewritten.rule, [i.id], [], [], `${desc} has no effect: ${rewritten.why}`);
          } else {
            const repl = rewritten.replacement.map((r) => ({ ...r, id: freshId(), srcLine: i.srcLine }));
            ev(rewritten.rule, [i.id], [], repl.map((r) => r.id), `${desc} simplifies: ${rewritten.why} → ${repl.map((r) => `${gateLabel(r.gate)} on ${r.qubits.map(qname).join(', ')}`).join(', ')}`);
            for (const r of repl) {
              out.push(r);
              transfer(r, s);
            }
          }
          continue;
        }
      }

      if (i.op === 'reset' && getQ(s, i.qubit) === 0) {
        ev('qconst-reset', [i.id], [], [], `reset of ${qname(i.qubit)} is redundant: it is already |0⟩`);
        continue;
      }

      if (i.op === 'read_result') {
        const v = getR(s, i.result);
        if (v !== 'T' && substitute(fn, i.dest, v, 'i1')) {
          ev('fold-read-result', [i.id], [], [], `measurement result ${resultName(fn, i.result)} is always ${v}: the measured qubit was provably ${ket(v)}, so ${i.dest} = ${v ? 'true' : 'false'}`);
          s.locals.set(i.dest, v);
          continue;
        }
      }

      if (i.op === 'classical') {
        const ops = i.operands.map((o) => valueOf(o, s));
        if (ops.every((o) => o !== 'T')) {
          const value = foldClassical(i.opcode, i.pred, ops[0] as number, (ops[1] ?? 0) as number);
          const type = i.opcode === 'icmp' ? 'i1' : (i.toType ?? i.type);
          if (substitute(fn, i.dest, value, type)) {
            ev('fold-classical', [i.id], [], [], `${i.dest} = ${i.opcode}${i.pred ? ` ${i.pred}` : ''}(${ops.join(', ')}) folds to ${type === 'i1' ? (value ? 'true' : 'false') : value}`);
            s.locals.set(i.dest, value);
            continue;
          }
        }
      }

      if (i.op === 'br' && i.cond) {
        const c = valueOf(i.cond, s);
        if (c !== 'T') {
          const taken = c ? i.ifTrue : i.ifFalse!;
          const dropped = c ? i.ifFalse! : i.ifTrue;
          const nb: Instr = { op: 'br', id: freshId(), ifTrue: taken, line: i.line, srcLine: i.srcLine };
          ev('fold-branch', [i.id], [], [nb.id], `branch condition is always ${c ? 'true' : 'false'}: always jump to %${taken}, never to %${dropped}`);
          out.push(nb);
          continue;
        }
        if (explain) {
          emit({
            kind: 'refusal', rule: 'fold-branch', fn: fn.name, block: block.label, ids: [i.id], reason: 'superposition',
            message: `kept the branch to %${i.ifTrue} / %${i.ifFalse}: its condition depends on a measurement of a qubit in superposition`,
          });
        }
      }

      transfer(i, s);
      out.push(i);
    }
    block.instrs = out;
  }
  return changed;
}

type Repl = Omit<GateInstr, 'id'>;
type GateRule = 'qconst-dead-control' | 'qconst-strength-reduce' | 'qconst-phase-drop' | 'qconst-swap';

/** Decide how a gate simplifies given the known basis states of its qubits. */
function rewriteGate(g: GateInstr, v: QVal[], qname: (r: Ref) => string): { rule: GateRule; replacement: Repl[]; why: string } | undefined {
  const mk = (gate: GateInstr['gate'], qubits: Ref[]): Repl => ({ op: 'gate', gate, qubits, params: [], srcLine: g.srcLine });
  const q = g.qubits;
  const is = (k: number) => `${qname(q[k])} is ${ket(v[k])}`;
  const zeroCtl = (k: number) => ({ rule: 'qconst-dead-control' as const, replacement: [], why: `control ${is(k)}, so it never fires` });
  if (g.qubits.length === 1 && isDiagonal(g.gate) && v[0] !== 'T') {
    return { rule: 'qconst-phase-drop', replacement: [], why: `${is(0)}, so the gate only adds an unobservable global phase` };
  }
  switch (g.gate) {
    case 'cx':
      if (v[0] === 0) return zeroCtl(0);
      if (v[0] === 1) return { rule: 'qconst-strength-reduce', replacement: [mk('x', [q[1]])], why: `control ${is(0)}, so it always fires` };
      return undefined;
    case 'cz':
      if (v[0] === 0) return zeroCtl(0);
      if (v[1] === 0) return zeroCtl(1);
      if (v[0] === 1 && v[1] === 1) return { rule: 'qconst-phase-drop', replacement: [], why: 'both qubits are |1⟩, so it only adds a global phase' };
      if (v[0] === 1) return { rule: 'qconst-strength-reduce', replacement: [mk('z', [q[1]])], why: `${is(0)}` };
      if (v[1] === 1) return { rule: 'qconst-strength-reduce', replacement: [mk('z', [q[0]])], why: `${is(1)}` };
      return undefined;
    case 'ccx':
      if (v[0] === 0) return zeroCtl(0);
      if (v[1] === 0) return zeroCtl(1);
      if (v[0] === 1 && v[1] === 1) return { rule: 'qconst-strength-reduce', replacement: [mk('x', [q[2]])], why: `both controls are |1⟩, so it always fires` };
      if (v[0] === 1) return { rule: 'qconst-strength-reduce', replacement: [mk('cx', [q[1], q[2]])], why: `control ${is(0)}, so only one control matters` };
      if (v[1] === 1) return { rule: 'qconst-strength-reduce', replacement: [mk('cx', [q[0], q[2]])], why: `control ${is(1)}, so only one control matters` };
      return undefined;
    case 'swap':
      if (v[0] !== 'T' && v[0] === v[1]) return { rule: 'qconst-swap', replacement: [], why: `both qubits are ${ket(v[0])}` };
      return undefined;
    default:
      return undefined;
  }
}
