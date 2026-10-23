// In-memory representation of a QIR module (the subset of LLVM IR that QIR uses).
//
// Quantum calls are decoded into structured instructions; everything the
// optimizer does not understand is kept verbatim as an `opaque` instruction
// and treated conservatively (as a barrier on every qubit).

import type { GateName } from '../gates';

/** A qubit or result operand: a static address (`inttoptr (i64 N to ptr)` / `null`) or an SSA value. */
export type Ref = { kind: 'static'; index: number } | { kind: 'dynamic'; name: string };

export type Value =
  | { kind: 'const'; type: string; value: number } // i1 constants use 0/1
  | { kind: 'local'; type: string; name: string };

interface Base {
  id: number;
  /** 1-based line in the source the instruction was parsed from (or generated for). */
  line?: number;
  /** Line in the original OpenQASM source, when compiled by our front-end. */
  srcLine?: number;
}

export interface GateInstr extends Base {
  op: 'gate';
  gate: GateName;
  qubits: Ref[];
  params: number[];
}
export interface MeasureInstr extends Base { op: 'measure'; qubit: Ref; result: Ref }
export interface ResetInstr extends Base { op: 'reset'; qubit: Ref }
export interface ReadResultInstr extends Base { op: 'read_result'; dest: string; result: Ref }
/** Output recording calls — no effect on quantum state, kept in order. */
export interface RecordInstr extends Base { op: 'record'; callee: string; args: string; result?: Ref }

export type ClassicalOpcode = 'zext' | 'shl' | 'or' | 'and' | 'xor' | 'add' | 'sub' | 'icmp';
export interface ClassicalInstr extends Base {
  op: 'classical';
  dest: string;
  opcode: ClassicalOpcode;
  /** For icmp: eq | ne | ult | ugt | ule | uge | slt | sgt | sle | sge. */
  pred?: string;
  type: string; // operand type
  toType?: string; // for zext
  operands: Value[];
}

export interface BranchInstr extends Base {
  op: 'br';
  cond?: Value;
  ifTrue: string;
  ifFalse?: string;
}
export interface RetInstr extends Base { op: 'ret'; text: string }

/** Anything else: kept as text. `calls` marks unknown function calls (barriers). */
export interface OpaqueInstr extends Base {
  op: 'opaque';
  text: string;
  dest?: string;
  isCall: boolean;
  callee?: string;
}

export type Instr =
  | GateInstr | MeasureInstr | ResetInstr | ReadResultInstr | RecordInstr
  | ClassicalInstr | BranchInstr | RetInstr | OpaqueInstr;

export interface Block {
  label: string;
  instrs: Instr[];
}

export interface Fn {
  name: string;
  /** The original `define ... {` line, re-emitted verbatim. */
  header: string;
  blocks: Block[];
  /** Entry points start with every qubit in |0⟩; other functions make no assumptions. */
  isEntryPoint: boolean;
  /** Source-level names for static qubits/results (e.g. "a[0]"), when known. */
  qubitNames?: string[];
  resultNames?: string[];
}

export interface ModuleStyle {
  /** Opaque pointers (`ptr`, QIR 2 / LLVM ≥ 15) or typed pointers (`%Qubit*`). */
  opaquePointers: boolean;
  /** `__quantum__qis__h__body` (spec naming) or `__quantum__qis__h` (legacy/plain). */
  bodySuffix: boolean;
}

export interface Module {
  /** Top-level lines before the first function, minus `declare`s. */
  preamble: string[];
  functions: Fn[];
  /** Function declarations by callee name, in original order. */
  declares: Map<string, string>;
  /** Attribute groups, metadata and other trailing lines. */
  trailer: string[];
  style: ModuleStyle;
}

let nextId = 1;
export function freshId(): number {
  return nextId++;
}

export function cloneModule(m: Module): Module {
  return {
    preamble: [...m.preamble],
    functions: m.functions.map((f) => ({
      ...f,
      blocks: f.blocks.map((b) => ({ label: b.label, instrs: b.instrs.map(cloneInstr) })),
    })),
    declares: new Map(m.declares),
    trailer: [...m.trailer],
    style: { ...m.style },
  };
}

export function cloneInstr<T extends Instr>(i: T): T {
  const c = { ...i } as T;
  if (i.op === 'gate') {
    (c as GateInstr).qubits = i.qubits.map((q) => ({ ...q }));
    (c as GateInstr).params = [...i.params];
  }
  if (i.op === 'classical') (c as ClassicalInstr).operands = i.operands.map((v) => ({ ...v }));
  return c;
}

export function refEq(a: Ref, b: Ref): boolean {
  return a.kind === 'static' ? b.kind === 'static' && a.index === b.index : b.kind === 'dynamic' && a.name === b.name;
}

/** Two references definitely denote the same qubit. */
export const mustAlias = refEq;

/**
 * Two references might denote the same qubit. Distinct static addresses never
 * alias; anything involving an SSA value (a function parameter, an allocated
 * qubit) is assumed to possibly alias — the conservative choice.
 */
export function mayAlias(a: Ref, b: Ref): boolean {
  if (a.kind === 'static' && b.kind === 'static') return a.index === b.index;
  if (a.kind === 'dynamic' && b.kind === 'dynamic' && a.name === b.name) return true;
  return true;
}

export function refKey(r: Ref): string {
  return r.kind === 'static' ? `q${r.index}` : r.name;
}

/** Human-readable qubit name: the source register name when known, else q<N> / %ssa. */
export function qubitName(fn: Fn | undefined, r: Ref): string {
  if (r.kind === 'static' && fn?.qubitNames?.[r.index]) return fn.qubitNames[r.index];
  return refKey(r);
}

export function resultName(fn: Fn | undefined, r: Ref): string {
  if (r.kind === 'static' && fn?.resultNames?.[r.index]) return fn.resultNames[r.index];
  return r.kind === 'static' ? `r${r.index}` : r.name;
}

/** Qubits an instruction touches; `'all'` for unknown calls. */
export function touchedQubits(i: Instr): Ref[] | 'all' {
  switch (i.op) {
    case 'gate': return i.qubits;
    case 'measure': return [i.qubit];
    case 'reset': return [i.qubit];
    case 'opaque': return i.isCall ? 'all' : [];
    default: return [];
  }
}

export function quantumOpCount(m: Module): number {
  let n = 0;
  for (const f of m.functions) for (const b of f.blocks) for (const i of b.instrs) if (i.op === 'gate') n++;
  return n;
}
