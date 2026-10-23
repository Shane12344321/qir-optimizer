// Semantic analysis for OpenQASM 2.0: symbol tables, arity and bounds checks,
// constant folding of parameter expressions, inline expansion of user-defined
// gates, and lowering of the qelib1 library onto the native gate set.

import type { Diagnostic, Span } from '../diagnostics';
import { type GateName } from '../gates';
import type { Arg, Barrier, Expr, GateCall, Program, QuantumOp, Stmt } from './ast';

export interface Register {
  name: string;
  size: number;
  offset: number;
}

export type COp =
  | { kind: 'gate'; gate: GateName; qubits: number[]; params: number[]; src: Span }
  | { kind: 'measure'; qubit: number; result: number; src: Span }
  | { kind: 'reset'; qubit: number; src: Span }
  | { kind: 'barrier'; qubits: number[]; src: Span }
  | { kind: 'opaque'; name: string; qubits: number[]; params: number[]; src: Span }
  | { kind: 'if'; creg: Register; value: number; body: COp[]; src: Span };

export interface CircuitProgram {
  numQubits: number;
  numResults: number;
  qregs: Register[];
  cregs: Register[];
  ops: COp[];
}

type Native = [GateName, number[], number[]]; // gate, params, local qubit indices

interface LibGate {
  params: number;
  qubits: number;
  expand: (p: number[]) => Native[];
}

const PI = Math.PI;

// U(θ,φ,λ) = Rz(φ)·Ry(θ)·Rz(λ) up to a global phase (applied right-to-left in time).
const u3 = (t: number, p: number, l: number): Native[] => [
  ['rz', [l], [0]],
  ['ry', [t], [0]],
  ['rz', [p], [0]],
];

/** qelib1.inc gates, lowered onto the native set. Global phases are dropped (QASM 2 has no controlled user gates). */
const QELIB: Record<string, LibGate> = {
  u3: { params: 3, qubits: 1, expand: ([t, p, l]) => u3(t, p, l) },
  u2: { params: 2, qubits: 1, expand: ([p, l]) => u3(PI / 2, p, l) },
  u1: { params: 1, qubits: 1, expand: ([l]) => [['rz', [l], [0]]] },
  p: { params: 1, qubits: 1, expand: ([l]) => [['rz', [l], [0]]] },
  u: { params: 3, qubits: 1, expand: ([t, p, l]) => u3(t, p, l) },
  id: { params: 0, qubits: 1, expand: () => [] },
  x: { params: 0, qubits: 1, expand: () => [['x', [], [0]]] },
  y: { params: 0, qubits: 1, expand: () => [['y', [], [0]]] },
  z: { params: 0, qubits: 1, expand: () => [['z', [], [0]]] },
  h: { params: 0, qubits: 1, expand: () => [['h', [], [0]]] },
  s: { params: 0, qubits: 1, expand: () => [['s', [], [0]]] },
  sdg: { params: 0, qubits: 1, expand: () => [['sdg', [], [0]]] },
  t: { params: 0, qubits: 1, expand: () => [['t', [], [0]]] },
  tdg: { params: 0, qubits: 1, expand: () => [['tdg', [], [0]]] },
  rx: { params: 1, qubits: 1, expand: ([a]) => [['rx', [a], [0]]] },
  ry: { params: 1, qubits: 1, expand: ([a]) => [['ry', [a], [0]]] },
  rz: { params: 1, qubits: 1, expand: ([a]) => [['rz', [a], [0]]] },
  cx: { params: 0, qubits: 2, expand: () => [['cx', [], [0, 1]]] },
  cz: { params: 0, qubits: 2, expand: () => [['cz', [], [0, 1]]] },
  cy: { params: 0, qubits: 2, expand: () => [['sdg', [], [1]], ['cx', [], [0, 1]], ['s', [], [1]]] },
  swap: { params: 0, qubits: 2, expand: () => [['swap', [], [0, 1]]] },
  ccx: { params: 0, qubits: 3, expand: () => [['ccx', [], [0, 1, 2]]] },
  ch: {
    params: 0, qubits: 2,
    expand: () => [['s', [], [1]], ['h', [], [1]], ['t', [], [1]], ['cx', [], [0, 1]], ['tdg', [], [1]], ['h', [], [1]], ['sdg', [], [1]]],
  },
  crz: {
    params: 1, qubits: 2,
    expand: ([l]) => [['rz', [l / 2], [1]], ['cx', [], [0, 1]], ['rz', [-l / 2], [1]], ['cx', [], [0, 1]]],
  },
  cu1: {
    params: 1, qubits: 2,
    expand: ([l]) => [['rz', [l / 2], [0]], ['cx', [], [0, 1]], ['rz', [-l / 2], [1]], ['cx', [], [0, 1]], ['rz', [l / 2], [1]]],
  },
  cp: {
    params: 1, qubits: 2,
    expand: ([l]) => [['rz', [l / 2], [0]], ['cx', [], [0, 1]], ['rz', [-l / 2], [1]], ['cx', [], [0, 1]], ['rz', [l / 2], [1]]],
  },
};

const BUILTIN: Record<string, LibGate> = {
  U: { params: 3, qubits: 1, expand: ([t, p, l]) => u3(t, p, l) },
  CX: { params: 0, qubits: 2, expand: () => [['cx', [], [0, 1]]] },
};

interface UserGate {
  name: string;
  params: string[];
  qargs: string[];
  body: (GateCall | Barrier)[];
  opaque: boolean;
  span: Span;
}

export interface SemaResult {
  circuit: CircuitProgram;
  diagnostics: Diagnostic[];
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** Names people commonly reach for from other quantum languages. */
const ALIASES: Record<string, string> = { cnot: 'cx', toffoli: 'ccx', ccnot: 'ccx', hadamard: 'h', not: 'x', phase: 'u1', cphase: 'cu1' };

function suggest(name: string, candidates: string[]): string | undefined {
  const alias = ALIASES[name.toLowerCase()];
  if (alias && candidates.includes(alias)) return alias;
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = levenshtein(name.toLowerCase(), c.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best !== undefined && bestD <= Math.max(1, Math.floor(name.length / 3)) ? best : undefined;
}

class SemaError extends Error {}

export function analyze(program: Program): SemaResult {
  return new Analyzer().run(program);
}

class Analyzer {
  private diagnostics: Diagnostic[] = [];
  private qregs = new Map<string, Register>();
  private cregs = new Map<string, Register>();
  private userGates = new Map<string, UserGate>();
  private includedQelib = false;
  private numQubits = 0;
  private numResults = 0;

  private error(message: string, span: Span, hint?: string, code = 'E0200'): never {
    this.diagnostics.push({ severity: 'error', code, message, span, hint });
    throw new SemaError(message);
  }

  private warn(message: string, span: Span, hint?: string, code = 'W0200') {
    this.diagnostics.push({ severity: 'warning', code, message, span, hint });
  }

  run(program: Program): SemaResult {
    const ops: COp[] = [];
    const first = program.stmts[0];
    if (!first || first.kind !== 'version') {
      this.warn('missing OPENQASM version header', first?.span ?? { line: 1, col: 1, length: 1 }, "start the file with 'OPENQASM 2.0;'", 'W0001');
    }
    for (const stmt of program.stmts) {
      try {
        ops.push(...this.statement(stmt));
      } catch (e) {
        if (!(e instanceof SemaError)) throw e;
      }
    }
    return {
      circuit: {
        numQubits: this.numQubits,
        numResults: this.numResults,
        qregs: [...this.qregs.values()],
        cregs: [...this.cregs.values()],
        ops,
      },
      diagnostics: this.diagnostics,
    };
  }

  private statement(stmt: Stmt): COp[] {
    switch (stmt.kind) {
      case 'version':
        if (stmt.version !== '2.0' && stmt.version !== '2') {
          this.warn(`OpenQASM ${stmt.version} is not fully supported; treating as 2.0`, stmt.span);
        }
        return [];
      case 'include':
        if (stmt.file === 'qelib1.inc') this.includedQelib = true;
        else this.error(`cannot find include file "${stmt.file}"`, stmt.span, 'only "qelib1.inc" is built in');
        return [];
      case 'qreg':
      case 'creg': {
        if (this.qregs.has(stmt.name) || this.cregs.has(stmt.name)) {
          this.error(`register '${stmt.name}' is already declared`, stmt.span);
        }
        if (stmt.size <= 0) this.error(`register '${stmt.name}' must have a positive size`, stmt.span);
        if (stmt.kind === 'qreg') {
          this.qregs.set(stmt.name, { name: stmt.name, size: stmt.size, offset: this.numQubits });
          this.numQubits += stmt.size;
        } else {
          this.cregs.set(stmt.name, { name: stmt.name, size: stmt.size, offset: this.numResults });
          this.numResults += stmt.size;
        }
        return [];
      }
      case 'gatedef': {
        if (this.userGates.has(stmt.name) || BUILTIN[stmt.name] || (this.includedQelib && QELIB[stmt.name])) {
          this.error(`gate '${stmt.name}' is already defined`, stmt.span);
        }
        const seen = new Set<string>();
        for (const a of [...stmt.params, ...stmt.qargs]) {
          if (seen.has(a)) this.error(`duplicate parameter '${a}' in gate '${stmt.name}'`, stmt.span);
          seen.add(a);
        }
        // Check the body now so errors point at the definition, not the call site.
        for (const call of stmt.body) {
          for (const a of call.args) {
            if (a.index !== undefined) this.error('gate bodies may only use qubit arguments, not indexed registers', a.span);
            if (!stmt.qargs.includes(a.reg)) this.error(`unknown qubit argument '${a.reg}' in gate '${stmt.name}'`, a.span);
          }
          if (call.kind === 'call') {
            for (const e of call.params) this.checkExprIdents(e, stmt.params);
            this.lookupGate(call);
          }
        }
        this.userGates.set(stmt.name, { name: stmt.name, params: stmt.params, qargs: stmt.qargs, body: stmt.body, opaque: stmt.opaque, span: stmt.span });
        return [];
      }
      case 'if': {
        const creg = this.cregs.get(stmt.creg);
        if (!creg) {
          const hint = suggest(stmt.creg, [...this.cregs.keys()]);
          this.error(`unknown classical register '${stmt.creg}'`, stmt.cregSpan, hint ? `did you mean '${hint}'?` : undefined);
        }
        if (stmt.value >= 2 ** creg.size) {
          this.warn(`condition value ${stmt.value} can never match ${creg.size}-bit register '${creg.name}'`, stmt.span);
        }
        return [{ kind: 'if', creg, value: stmt.value, body: this.quantumOp(stmt.body), src: stmt.span }];
      }
      default:
        return this.quantumOp(stmt);
    }
  }

  private quantumOp(op: QuantumOp): COp[] {
    switch (op.kind) {
      case 'measure': {
        const qs = this.resolveQubits(op.q);
        const cs = this.resolveBits(op.c);
        if (qs.length !== cs.length) {
          this.error(`cannot measure ${qs.length} qubit(s) into ${cs.length} bit(s)`, op.span, 'register sizes must match');
        }
        return qs.map((q, i) => ({ kind: 'measure', qubit: q, result: cs[i], src: op.span }));
      }
      case 'reset':
        return this.resolveQubits(op.q).map((q) => ({ kind: 'reset', qubit: q, src: op.span }));
      case 'barrier':
        return [{ kind: 'barrier', qubits: op.args.flatMap((a) => this.resolveQubits(a)), src: op.span }];
      case 'call':
        return this.gateCall(op);
    }
  }

  private lookupGate(call: GateCall): { lib?: LibGate; user?: UserGate } {
    const user = this.userGates.get(call.name);
    if (user) {
      this.checkArity(call, user.params.length, user.qargs.length);
      return { user };
    }
    const builtin = BUILTIN[call.name];
    if (builtin) {
      this.checkArity(call, builtin.params, builtin.qubits);
      return { lib: builtin };
    }
    const lib = QELIB[call.name];
    if (lib) {
      if (!this.includedQelib) {
        this.error(`gate '${call.name}' is defined in qelib1.inc, which is not included`, call.nameSpan, 'add \'include "qelib1.inc";\' after the version header');
      }
      this.checkArity(call, lib.params, lib.qubits);
      return { lib };
    }
    const candidates = [...this.userGates.keys(), ...Object.keys(BUILTIN), ...(this.includedQelib ? Object.keys(QELIB) : [])];
    const hint = suggest(call.name, candidates);
    return this.error(`unknown gate '${call.name}'`, call.nameSpan, hint ? `did you mean '${hint}'?` : undefined, 'E0201');
  }

  private checkArity(call: GateCall, params: number, qubits: number) {
    if (call.params.length !== params) {
      this.error(`gate '${call.name}' takes ${params} parameter(s) but ${call.params.length} were given`, call.span, undefined, 'E0202');
    }
    if (call.args.length !== qubits) {
      this.error(`gate '${call.name}' acts on ${qubits} qubit(s) but ${call.args.length} were given`, call.span, undefined, 'E0203');
    }
  }

  private gateCall(call: GateCall): COp[] {
    const { lib, user } = this.lookupGate(call);
    const params = call.params.map((e) => this.evalExpr(e, new Map()));
    // Broadcasting: `h q;` applies to every qubit of q; mixed register/indexed args must agree in size.
    const resolved = call.args.map((a) => this.resolveQubits(a));
    const width = Math.max(...resolved.map((r) => r.length));
    for (let k = 0; k < resolved.length; k++) {
      if (resolved[k].length !== 1 && resolved[k].length !== width) {
        this.error(`register sizes do not match in call to '${call.name}'`, call.args[k].span);
      }
    }
    const out: COp[] = [];
    for (let b = 0; b < width; b++) {
      const qubits = resolved.map((r) => (r.length === 1 ? r[0] : r[b]));
      if (new Set(qubits).size !== qubits.length) {
        this.error(`gate '${call.name}' uses the same qubit more than once`, call.span, 'quantum gates need distinct qubits (no-cloning)', 'E0204');
      }
      out.push(...this.expandGate(call, lib, user, params, qubits, call.span, 0));
    }
    return out;
  }

  private expandGate(call: GateCall, lib: LibGate | undefined, user: UserGate | undefined, params: number[], qubits: number[], src: Span, depth: number): COp[] {
    if (depth > 64) this.error('gate expansion is too deep', src);
    if (lib) {
      return lib.expand(params).map(([g, p, qs]) => ({ kind: 'gate', gate: g, params: p, qubits: qs.map((i) => qubits[i]), src }));
    }
    const def = user!;
    if (def.opaque) return [{ kind: 'opaque', name: def.name, params, qubits, src }];
    const env = new Map(def.params.map((name, i) => [name, params[i]] as const));
    const qenv = new Map(def.qargs.map((name, i) => [name, qubits[i]] as const));
    const out: COp[] = [];
    for (const inner of def.body) {
      const innerQubits = inner.args.map((a) => qenv.get(a.reg)!);
      if (inner.kind === 'barrier') {
        out.push({ kind: 'barrier', qubits: innerQubits, src });
        continue;
      }
      const target = this.lookupGate(inner);
      const innerParams = inner.params.map((e) => this.evalExpr(e, env));
      out.push(...this.expandGate(inner, target.lib, target.user, innerParams, innerQubits, src, depth + 1));
    }
    void call;
    return out;
  }

  private resolveQubits(a: Arg): number[] {
    const reg = this.qregs.get(a.reg);
    if (!reg) {
      if (this.cregs.has(a.reg)) this.error(`'${a.reg}' is a classical register, expected qubits`, a.span);
      const hint = suggest(a.reg, [...this.qregs.keys()]);
      this.error(`unknown quantum register '${a.reg}'`, a.span, hint ? `did you mean '${hint}'?` : undefined, 'E0205');
    }
    return this.indices(reg, a);
  }

  private resolveBits(a: Arg): number[] {
    const reg = this.cregs.get(a.reg);
    if (!reg) {
      if (this.qregs.has(a.reg)) this.error(`'${a.reg}' is a quantum register, expected classical bits`, a.span);
      const hint = suggest(a.reg, [...this.cregs.keys()]);
      this.error(`unknown classical register '${a.reg}'`, a.span, hint ? `did you mean '${hint}'?` : undefined, 'E0205');
    }
    return this.indices(reg, a);
  }

  private indices(reg: Register, a: Arg): number[] {
    if (a.index === undefined) return Array.from({ length: reg.size }, (_, i) => reg.offset + i);
    if (a.index >= reg.size) {
      this.error(`index ${a.index} is out of bounds for register '${reg.name}' of size ${reg.size}`, a.span, `valid indices are 0..${reg.size - 1}`, 'E0206');
    }
    return [reg.offset + a.index];
  }

  private checkExprIdents(e: Expr, names: string[]): void {
    switch (e.kind) {
      case 'id':
        if (!names.includes(e.name)) this.error(`unknown parameter '${e.name}'`, e.span);
        return;
      case 'unary':
      case 'call':
        return this.checkExprIdents(e.arg, names);
      case 'binary':
        this.checkExprIdents(e.left, names);
        this.checkExprIdents(e.right, names);
        return;
      default:
        return;
    }
  }

  /** Constant folding: every parameter expression reduces to a number at compile time. */
  private evalExpr(e: Expr, env: Map<string, number>): number {
    switch (e.kind) {
      case 'num': return e.value;
      case 'pi': return Math.PI;
      case 'id': {
        const v = env.get(e.name);
        if (v === undefined) this.error(`unknown identifier '${e.name}'`, e.span);
        return v;
      }
      case 'unary': return -this.evalExpr(e.arg, env);
      case 'binary': {
        const l = this.evalExpr(e.left, env);
        const r = this.evalExpr(e.right, env);
        switch (e.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/':
            if (r === 0) this.error('division by zero in parameter expression', e.span);
            return l / r;
          case '^': return l ** r;
        }
        break;
      }
      case 'call': {
        const v = this.evalExpr(e.arg, env);
        switch (e.fn) {
          case 'sin': return Math.sin(v);
          case 'cos': return Math.cos(v);
          case 'tan': return Math.tan(v);
          case 'exp': return Math.exp(v);
          case 'ln':
            if (v <= 0) this.error('ln of a non-positive value', e.span);
            return Math.log(v);
          case 'sqrt':
            if (v < 0) this.error('sqrt of a negative value', e.span);
            return Math.sqrt(v);
        }
      }
    }
    return this.error('cannot evaluate expression', e.span);
  }
}
