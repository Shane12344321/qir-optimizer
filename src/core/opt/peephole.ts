// Peephole pass over each basic block's dependence structure:
//   * inverse cancellation   G · G⁻¹ = I
//   * commutation            gates slide past each other when provably safe
//   * rotation/phase merging Rz(a) · Rz(b) = Rz(a+b)
//
// A gate's "partner" is searched along its own wires only: gates on unrelated
// qubits are independent (they are not connected in the dependence DAG), so they
// never block a rewrite, unlike the textual "adjacent lines" check of Review 2.

import {
  ANGLE_EPS, GATES, gateForPhaseEighths, type GateName, isZeroAngle, normAngle, gateLabel,
} from '../gates';
import {
  type Block, type Fn, type GateInstr, type Instr, mayAlias, mustAlias, qubitName, touchedQubits,
} from '../qir/ir';
import { BLOCK_REASONS, type BlockReason, type Emit, type RuleId } from './trace';

export interface PeepholeOptions {
  cancel: boolean;
  commute: boolean;
  merge: boolean;
  explain: boolean;
}

/** Do two gates commute? Sound rule: on every possibly-shared wire both act in the same basis. */
export function commutes(a: GateInstr, b: GateInstr): boolean {
  const wa = GATES[a.gate].wires;
  const wb = GATES[b.gate].wires;
  for (let i = 0; i < a.qubits.length; i++) {
    for (let j = 0; j < b.qubits.length; j++) {
      if (!mayAlias(a.qubits[i], b.qubits[j])) continue;
      if (wa[i] === 'none' || wa[i] !== wb[j]) return false;
    }
  }
  return true;
}

function sameOperands(a: GateInstr, b: GateInstr): boolean {
  if (a.qubits.length !== b.qubits.length) return false;
  if (a.qubits.every((q, i) => mustAlias(q, b.qubits[i]))) return true;
  // Symmetric gates (CZ, SWAP, the two controls of CCX) may list operands in either order.
  const sym = GATES[a.gate].symmetric;
  if (!sym) return false;
  for (const group of sym) {
    const perm = a.qubits.map((_, i) => i);
    const [x, y] = group;
    perm[x] = y;
    perm[y] = x;
    if (perm.every((p, i) => mustAlias(a.qubits[p], b.qubits[i]))) return true;
  }
  return false;
}

export function isInversePair(a: GateInstr, b: GateInstr): boolean {
  const inv = GATES[a.gate].inverse;
  return inv === b.gate && a.gate === GATES[b.gate].inverse && sameOperands(a, b);
}

type ZPhase = { kind: 'eighths'; k: number } | { kind: 'angle'; a: number };

/** Diagonal single-qubit gates are all Rz rotations up to a global phase. */
function zPhase(g: GateInstr): ZPhase | undefined {
  if (g.gate === 'rz') return { kind: 'angle', a: g.params[0] };
  const k = GATES[g.gate].phaseEighths;
  return k === undefined ? undefined : { kind: 'eighths', k };
}

export function canMerge(a: GateInstr, b: GateInstr): boolean {
  if (a.qubits.length !== 1 || b.qubits.length !== 1 || !mustAlias(a.qubits[0], b.qubits[0])) return false;
  const ax = GATES[a.gate].axis;
  if (ax && ax === GATES[b.gate].axis) return true;
  return zPhase(a) !== undefined && zPhase(b) !== undefined;
}

type Found =
  | { kind: 'cancel' | 'merge'; j: number; slid: number }
  | { kind: 'blocked'; j: number; reason: BlockReason }
  | undefined;

function blockReasonFor(g: GateInstr, k: Instr): BlockReason {
  if (k.op === 'measure') return 'measurement';
  if (k.op === 'reset') return 'reset';
  if (k.op === 'opaque') return 'unknown-call';
  const touched = touchedQubits(k);
  if (touched !== 'all' && !touched.some((q) => g.qubits.some((gq) => mustAlias(gq, q)))) return 'alias';
  return 'non-commuting';
}

function findPartner(instrs: Instr[], i: number, opts: PeepholeOptions): Found {
  const g = instrs[i] as GateInstr;
  let slid = 0;
  for (let j = i + 1; j < instrs.length; j++) {
    const k = instrs[j];
    if (k.op === 'br' || k.op === 'ret') return undefined;
    const touched = touchedQubits(k);
    if (touched === 'all') return { kind: 'blocked', j, reason: 'unknown-call' };
    if (!touched.some((q) => g.qubits.some((gq) => mayAlias(gq, q)))) continue;
    if (k.op !== 'gate') return { kind: 'blocked', j, reason: blockReasonFor(g, k) };
    if (opts.cancel && isInversePair(g, k)) return { kind: 'cancel', j, slid };
    if (opts.merge && canMerge(g, k)) return { kind: 'merge', j, slid };
    if (opts.commute && commutes(g, k)) {
      slid++;
      continue;
    }
    return { kind: 'blocked', j, reason: blockReasonFor(g, k) };
  }
  return undefined;
}

/** After a blocked search, is there a gate further on that *would* have been a partner? (For explanations.) */
function wouldBePartner(instrs: Instr[], i: number, from: number, opts: PeepholeOptions): number | undefined {
  const g = instrs[i] as GateInstr;
  for (let j = from + 1; j < instrs.length; j++) {
    const k = instrs[j];
    if (k.op === 'br' || k.op === 'ret') return undefined;
    if (k.op !== 'gate') continue;
    if ((opts.cancel && isInversePair(g, k)) || (opts.merge && canMerge(g, k))) return j;
    const sharesWire = k.qubits.some((q) => g.qubits.some((gq) => mustAlias(gq, q)));
    if (sharesWire) return undefined;
  }
  return undefined;
}

function describe(g: GateInstr, fn?: Fn): string {
  return `${gateLabel(g.gate, g.params)} on ${g.qubits.map((q) => qubitName(fn, q)).join(', ')}`;
}

/** Merge `g` into `k` (same wire). Returns the rule used and whether `k` vanished entirely. */
function mergeInto(g: GateInstr, k: GateInstr): { rule: RuleId; vanished: boolean; result: string } {
  const ax = GATES[g.gate].axis;
  if (ax && ax === GATES[k.gate].axis) {
    const angle = normAngle(g.params[0] + k.params[0]);
    if (isZeroAngle(angle)) return { rule: 'merge-rotation', vanished: true, result: 'identity' };
    k.params = [angle];
    return { rule: 'merge-rotation', vanished: false, result: gateLabel(k.gate, k.params) };
  }
  const pa = zPhase(g)!;
  const pb = zPhase(k)!;
  if (pa.kind === 'eighths' && pb.kind === 'eighths') {
    const sum = pa.k + pb.k;
    const named = gateForPhaseEighths(sum);
    if (named === 'identity') return { rule: 'fold-phase', vanished: true, result: 'identity' };
    if (named) {
      k.gate = named;
      k.params = [];
      return { rule: 'fold-phase', vanished: false, result: gateLabel(named) };
    }
    k.gate = 'rz';
    k.params = [normAngle((sum * Math.PI) / 4)];
    return { rule: 'fold-phase', vanished: false, result: gateLabel('rz', k.params) };
  }
  const toAngle = (p: ZPhase) => (p.kind === 'angle' ? p.a : (p.k * Math.PI) / 4);
  const angle = normAngle(toAngle(pa) + toAngle(pb));
  if (isZeroAngle(angle)) return { rule: 'merge-rotation', vanished: true, result: 'identity' };
  // Prefer a named Clifford+T gate when the angle is a multiple of π/4.
  const eighths = (angle * 4) / Math.PI;
  const named = Math.abs(eighths - Math.round(eighths)) < ANGLE_EPS ? gateForPhaseEighths(Math.round(eighths)) : undefined;
  if (named && named !== 'identity') {
    k.gate = named as GateName;
    k.params = [];
  } else {
    k.gate = 'rz';
    k.params = [angle];
  }
  return { rule: 'merge-rotation', vanished: false, result: gateLabel(k.gate, k.params) };
}

/** Run the peephole rules on one block until it stops changing. Returns true if anything changed. */
export function peepholeBlock(fn: Fn, block: Block, opts: PeepholeOptions, emit: Emit): boolean {
  let changed = false;
  const instrs = block.instrs;
  let i = 0;
  while (i < instrs.length) {
    const g = instrs[i];
    if (g.op !== 'gate') {
      i++;
      continue;
    }
    const found = findPartner(instrs, i, opts);
    if (!found) {
      i++;
      continue;
    }
    if (found.kind === 'blocked') {
      if (opts.explain) {
        const p = wouldBePartner(instrs, i, found.j, opts);
        if (p !== undefined) {
          const partner = instrs[p] as GateInstr;
          emit({
            kind: 'refusal',
            rule: isInversePair(g, partner) ? (g.gate === partner.gate ? 'cancel-self-inverse' : 'cancel-adjoint') : 'merge-rotation',
            fn: fn.name,
            block: block.label,
            ids: [g.id, partner.id],
            blocker: instrs[found.j].id,
            reason: found.reason,
            message: `kept ${describe(g, fn)} and ${describe(partner, fn)}: ${BLOCK_REASONS[found.reason]}`,
          });
        }
      }
      i++;
      continue;
    }

    const k = instrs[found.j] as GateInstr;
    const via = found.slid > 0 ? ` after moving past ${found.slid} commuting gate${found.slid > 1 ? 's' : ''}` : '';
    if (found.kind === 'cancel') {
      const rule: RuleId = found.slid > 0 ? 'cancel-commuted' : g.gate === k.gate ? 'cancel-self-inverse' : 'cancel-adjoint';
      instrs.splice(found.j, 1);
      instrs.splice(i, 1);
      emit({
        kind: 'rewrite', rule, fn: fn.name, block: block.label,
        removed: [g.id, k.id], changed: [], added: [],
        message: `${describe(g, fn)} cancels ${describe(k, fn)}${via}`,
      });
    } else {
      const before = describe(k, fn);
      const { rule, vanished, result } = mergeInto(g, k);
      if (vanished) instrs.splice(found.j, 1);
      instrs.splice(i, 1);
      emit({
        kind: 'rewrite', rule, fn: fn.name, block: block.label,
        removed: vanished ? [g.id, k.id] : [g.id], changed: vanished ? [] : [k.id], added: [],
        message: `${describe(g, fn)} merged into ${before}${via} → ${result}`,
      });
    }
    changed = true;
    // A removal can expose a new pair just before position i (e.g. H X X H); step back to catch cascades.
    // Longer-range cascades are picked up by the pipeline's fixed-point loop.
    i = Math.max(0, i - 4);
  }
  return changed;
}

export function peephole(fn: Fn, opts: PeepholeOptions, emit: Emit): boolean {
  let changed = false;
  for (const b of fn.blocks) changed = peepholeBlock(fn, b, opts, emit) || changed;
  return changed;
}
