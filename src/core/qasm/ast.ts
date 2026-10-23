// Abstract syntax tree for the supported OpenQASM 2.0 subset.

import type { Span } from '../diagnostics';

export type Expr =
  | { kind: 'num'; value: number; span: Span }
  | { kind: 'pi'; span: Span }
  | { kind: 'id'; name: string; span: Span }
  | { kind: 'unary'; op: '-'; arg: Expr; span: Span }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: Expr; right: Expr; span: Span }
  | { kind: 'call'; fn: string; arg: Expr; span: Span };

/** A register reference: `q` (whole register) or `q[3]`. */
export interface Arg {
  reg: string;
  index?: number;
  span: Span;
}

export interface GateCall {
  kind: 'call';
  name: string;
  nameSpan: Span;
  params: Expr[];
  args: Arg[];
  span: Span;
}

export interface Measure { kind: 'measure'; q: Arg; c: Arg; span: Span }
export interface Reset { kind: 'reset'; q: Arg; span: Span }
export interface Barrier { kind: 'barrier'; args: Arg[]; span: Span }

export type QuantumOp = GateCall | Measure | Reset | Barrier;

export type Stmt =
  | { kind: 'version'; version: string; span: Span }
  | { kind: 'include'; file: string; span: Span }
  | { kind: 'qreg' | 'creg'; name: string; size: number; span: Span }
  | { kind: 'gatedef'; name: string; params: string[]; qargs: string[]; body: (GateCall | Barrier)[]; span: Span; opaque: boolean }
  | QuantumOp
  | { kind: 'if'; creg: string; cregSpan: Span; value: number; body: QuantumOp; span: Span };

export interface Program {
  stmts: Stmt[];
}
