// QIR parser: reads the subset of LLVM IR text that QIR programs use and
// decodes quantum calls into structured instructions. Unknown instructions are
// preserved verbatim as `opaque` so no program is ever rejected for using
// LLVM features the optimizer does not model.

import type { Diagnostic } from '../diagnostics';
import { CompileError } from '../diagnostics';
import type { GateName } from '../gates';
import {
  type Block, type ClassicalOpcode, type Fn, freshId, type Instr, type Module, type ModuleStyle, type Ref, type Value,
} from './ir';

// ---------------------------------------------------------------- tokenizer

type TokKind = 'local' | 'global' | 'word' | 'num' | 'str' | 'punct' | 'attr';
interface Tok { kind: TokKind; text: string; col: number }

function tokenize(line: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === ';') break; // comment
    const start = i;
    if (c === '%' || c === '@') {
      i++;
      if (line[i] === '"') {
        i++;
        while (i < line.length && line[i] !== '"') i++;
        i++;
      } else {
        while (i < line.length && /[-A-Za-z$._0-9]/.test(line[i])) i++;
      }
      toks.push({ kind: c === '%' ? 'local' : 'global', text: line.slice(start, i), col: start + 1 });
      continue;
    }
    if (c === '#') {
      i++;
      while (i < line.length && /[0-9]/.test(line[i])) i++;
      toks.push({ kind: 'attr', text: line.slice(start, i), col: start + 1 });
      continue;
    }
    if (c === '"') {
      i++;
      while (i < line.length && line[i] !== '"') i++;
      i++;
      toks.push({ kind: 'str', text: line.slice(start, i), col: start + 1 });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(line[i + 1] ?? ''))) {
      if (line.startsWith('0x', i)) {
        i += 2;
        while (i < line.length && /[0-9A-Fa-f]/.test(line[i])) i++;
      } else {
        i++;
        while (i < line.length && /[0-9.eE+-]/.test(line[i])) {
          if ((line[i] === '+' || line[i] === '-') && !/[eE]/.test(line[i - 1])) break;
          i++;
        }
      }
      toks.push({ kind: 'num', text: line.slice(start, i), col: start + 1 });
      continue;
    }
    if (/[A-Za-z_$.]/.test(c)) {
      while (i < line.length && /[A-Za-z_$.0-9]/.test(line[i])) i++;
      toks.push({ kind: 'word', text: line.slice(start, i), col: start + 1 });
      continue;
    }
    toks.push({ kind: 'punct', text: c, col: start + 1 });
    i++;
  }
  return toks;
}

/** Remove a trailing `; comment`, ignoring semicolons inside strings. */
function stripComment(line: string): string {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inStr = !inStr;
    if (line[i] === ';' && !inStr) return line.slice(0, i).trimEnd();
  }
  return line;
}

class Cursor {
  pos = 0;
  constructor(public toks: Tok[]) {}
  peek(o = 0) { return this.toks[this.pos + o]; }
  next() { return this.toks[this.pos++]; }
  done() { return this.pos >= this.toks.length; }
  accept(text: string) {
    if (this.peek()?.text === text) { this.pos++; return true; }
    return false;
  }
  expect(text: string) {
    if (!this.accept(text)) throw new Unsupported();
  }
}

class Unsupported extends Error {}

const PARAM_ATTRS = new Set(['writeonly', 'readonly', 'nocapture', 'noundef', 'nonnull', 'readnone', 'immarg', 'signext', 'zeroext', 'inreg']);
const INT_FLAGS = new Set(['nuw', 'nsw', 'exact', 'disjoint']);

/** Parse a type: `ptr`, `i64`, `double`, `void`, `%Qubit*`, `i8**`, ... */
function parseType(c: Cursor): string {
  const t = c.next();
  if (!t || (t.kind !== 'word' && t.kind !== 'local')) throw new Unsupported();
  let ty = t.text;
  while (c.peek()?.text === '*') { c.next(); ty += '*'; }
  return ty;
}

type ArgValue =
  | { kind: 'ref'; ref: Ref }
  | { kind: 'num'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'local'; name: string }
  | { kind: 'other' };

function parseNumber(text: string): number {
  if (text.startsWith('0x')) {
    const hex = text.slice(2).padStart(16, '0');
    const buf = new DataView(new ArrayBuffer(8));
    for (let k = 0; k < 8; k++) buf.setUint8(k, parseInt(hex.slice(k * 2, k * 2 + 2), 16));
    return buf.getFloat64(0);
  }
  return Number(text);
}

function parseValue(c: Cursor): ArgValue {
  const t = c.next();
  if (!t) throw new Unsupported();
  if (t.text === 'null') return { kind: 'ref', ref: { kind: 'static', index: 0 } };
  if (t.text === 'true' || t.text === 'false') return { kind: 'bool', value: t.text === 'true' };
  if (t.kind === 'num') return { kind: 'num', value: parseNumber(t.text) };
  if (t.kind === 'local') return { kind: 'local', name: t.text };
  if (t.text === 'inttoptr') {
    c.expect('(');
    parseType(c);
    const n = c.next();
    if (n?.kind !== 'num') throw new Unsupported();
    c.expect('to');
    parseType(c);
    c.expect(')');
    return { kind: 'ref', ref: { kind: 'static', index: Number(n.text) } };
  }
  return { kind: 'other' };
}

interface CallArg { type: string; value: ArgValue }

function parseArgs(c: Cursor): CallArg[] {
  c.expect('(');
  const args: CallArg[] = [];
  if (c.accept(')')) return args;
  for (;;) {
    const type = parseType(c);
    while (c.peek() && PARAM_ATTRS.has(c.peek().text)) c.next();
    args.push({ type, value: parseValue(c) });
    if (c.accept(')')) return args;
    c.expect(',');
  }
}

function asRef(a: CallArg | undefined): Ref | undefined {
  if (!a) return undefined;
  if (a.value.kind === 'ref') return a.value.ref;
  if (a.value.kind === 'local') return { kind: 'dynamic', name: a.value.name };
  return undefined;
}

function toValue(a: ArgValue, type: string): Value | undefined {
  if (a.kind === 'num') return { kind: 'const', type, value: a.value };
  if (a.kind === 'bool') return { kind: 'const', type, value: a.value ? 1 : 0 };
  if (a.kind === 'local') return { kind: 'local', type, name: a.name };
  return undefined;
}

const QIS_GATES: Record<string, GateName> = {
  h: 'h', x: 'x', y: 'y', z: 'z', s: 's', t: 't', rx: 'rx', ry: 'ry', rz: 'rz',
  cnot: 'cx', cx: 'cx', cz: 'cz', swap: 'swap', ccx: 'ccx', ccnot: 'ccx', toffoli: 'ccx',
  s__adj: 'sdg', t__adj: 'tdg', sdg: 'sdg', tdg: 'tdg',
};

function decodeCall(dest: string | undefined, callee: string, args: CallArg[], text: string): Instr {
  const id = freshId();
  const opaque = (): Instr => ({ op: 'opaque', id, text, dest, isCall: true, callee });

  if (callee.startsWith('__quantum__qis__')) {
    let rest = callee.slice('__quantum__qis__'.length).replace(/^_+/, '');
    rest = rest.replace(/__body$/, '');
    if (rest === 'mz' || rest === 'm' && args.length === 2) {
      const q = asRef(args[0]);
      const r = asRef(args[1]);
      if (dest || !q || !r) return opaque();
      return { op: 'measure', id, qubit: q, result: r };
    }
    if (rest === 'reset') {
      const q = asRef(args[0]);
      return q && !dest ? { op: 'reset', id, qubit: q } : opaque();
    }
    if (rest === 'read_result') {
      const r = asRef(args[0]);
      return r && dest ? { op: 'read_result', id, dest, result: r } : opaque();
    }
    const gate = QIS_GATES[rest.toLowerCase()];
    if (!gate || dest) return opaque();
    const isRot = gate === 'rx' || gate === 'ry' || gate === 'rz';
    const params: number[] = [];
    let qargs = args;
    if (isRot) {
      const p = args[0];
      if (!p || p.value.kind !== 'num' || p.type !== 'double') return opaque();
      params.push(p.value.value);
      qargs = args.slice(1);
    }
    const arity = gate === 'ccx' ? 3 : gate === 'cx' || gate === 'cz' || gate === 'swap' ? 2 : 1;
    if (qargs.length !== arity) return opaque();
    const qubits = qargs.map(asRef);
    if (qubits.some((q) => !q)) return opaque();
    return { op: 'gate', id, gate, qubits: qubits as Ref[], params };
  }

  if (callee === '__quantum__rt__read_result') {
    const r = asRef(args[0]);
    return r && dest ? { op: 'read_result', id, dest, result: r } : opaque();
  }
  if (!dest && (callee === '__quantum__rt__initialize' || /^__quantum__rt__\w*record_output$/.test(callee))) {
    const open = text.indexOf('(');
    const argText = text.slice(open + 1, text.lastIndexOf(')'));
    const result = callee === '__quantum__rt__result_record_output' ? asRef(args[0]) : undefined;
    return { op: 'record', id, callee, args: argText, result };
  }
  return opaque();
}

const BINOPS = new Set(['shl', 'or', 'and', 'xor', 'add', 'sub']);

function parseInstruction(text: string): Instr {
  const toks = tokenize(text);
  const c = new Cursor(toks);
  let dest: string | undefined;
  if (toks[0]?.kind === 'local' && toks[1]?.text === '=') {
    dest = toks[0].text;
    c.pos = 2;
  }
  const opaque = (isCall = false, callee?: string): Instr => ({ op: 'opaque', id: freshId(), text, dest, isCall, callee });
  try {
    const head = c.next()?.text;
    if (head === 'tail' || head === 'musttail' || head === 'notail') {
      if (c.next()?.text !== 'call') return opaque(true);
      return parseCallRest(c, dest, text);
    }
    if (head === 'call') return parseCallRest(c, dest, text);
    if (head === 'ret') return { op: 'ret', id: freshId(), text };
    if (head === 'unreachable') return { op: 'ret', id: freshId(), text };
    if (head === 'br') {
      if (c.peek()?.text === 'label') {
        c.next();
        const l = c.next();
        return { op: 'br', id: freshId(), ifTrue: l.text.slice(1) };
      }
      const type = parseType(c);
      const cond = toValue(parseValue(c), type);
      c.expect(',');
      c.expect('label');
      const t = c.next().text.slice(1);
      c.expect(',');
      c.expect('label');
      const f = c.next().text.slice(1);
      if (!cond) return opaque();
      return { op: 'br', id: freshId(), cond, ifTrue: t, ifFalse: f };
    }
    if (dest && head === 'zext') {
      const type = parseType(c);
      const v = toValue(parseValue(c), type);
      c.expect('to');
      const toType = parseType(c);
      if (!v || !c.done()) return opaque();
      return { op: 'classical', id: freshId(), dest, opcode: 'zext', type, toType, operands: [v] };
    }
    if (dest && head && BINOPS.has(head)) {
      while (c.peek() && INT_FLAGS.has(c.peek().text)) c.next();
      const type = parseType(c);
      const a = toValue(parseValue(c), type);
      c.expect(',');
      const b = toValue(parseValue(c), type);
      if (!a || !b || !c.done()) return opaque();
      return { op: 'classical', id: freshId(), dest, opcode: head as ClassicalOpcode, type, operands: [a, b] };
    }
    if (dest && head === 'icmp') {
      const pred = c.next().text;
      const type = parseType(c);
      const a = toValue(parseValue(c), type);
      c.expect(',');
      const b = toValue(parseValue(c), type);
      if (!a || !b || !c.done()) return opaque();
      return { op: 'classical', id: freshId(), dest, opcode: 'icmp', pred, type, operands: [a, b] };
    }
  } catch (e) {
    if (!(e instanceof Unsupported)) throw e;
    const isCall = /\bcall\b/.test(text);
    const callee = isCall ? /@([-A-Za-z$._0-9]+)/.exec(text)?.[1] : undefined;
    return opaque(isCall, callee);
  }
  return opaque();
}

function parseCallRest(c: Cursor, dest: string | undefined, text: string): Instr {
  // Skip calling-convention / return attributes until the return type.
  while (c.peek() && ['fastcc', 'ccc', 'coldcc', 'noundef', 'zeroext', 'signext', 'inreg'].includes(c.peek().text)) c.next();
  parseType(c);
  const callee = c.next();
  if (callee?.kind !== 'global') throw new Unsupported();
  const name = callee.text.slice(1).replace(/^"|"$/g, '');
  const args = parseArgs(c);
  return decodeCall(dest, name, args, text);
}

// ---------------------------------------------------------------- module

const LABEL_RE = /^([-A-Za-z$._0-9]+|"[^"]*"):/;

export function parseQir(source: string, fileName = '<input>'): Module {
  const lines = source.split(/\r?\n/);
  const preamble: string[] = [];
  const trailer: string[] = [];
  const declares = new Map<string, string>();
  const functions: Fn[] = [];
  const entryGroups = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  let current: { fn: Fn; block: Block | undefined; line: number } | undefined;

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const lineNo = li + 1;
    const trimmed = raw.trim();

    if (current) {
      const code = stripComment(trimmed);
      if (code === '') continue;
      if (code === '}') {
        functions.push(current.fn);
        current = undefined;
        continue;
      }
      const label = LABEL_RE.exec(code);
      if (label && !code.includes('=')) {
        current.block = { label: label[1].replace(/^"|"$/g, ''), instrs: [] };
        current.fn.blocks.push(current.block);
        continue;
      }
      if (!current.block) {
        current.block = { label: 'entry', instrs: [] };
        current.fn.blocks.push(current.block);
      }
      const instr = parseInstruction(code);
      instr.line = lineNo;
      current.block.instrs.push(instr);
      continue;
    }

    if (trimmed.startsWith('define ')) {
      const nameMatch = /@([-A-Za-z$._0-9]+|"[^"]*")\s*\(/.exec(trimmed);
      if (!nameMatch || !trimmed.endsWith('{')) {
        diagnostics.push({ severity: 'error', code: 'E0300', message: 'malformed function definition', span: { line: lineNo, col: 1, length: trimmed.length } });
        continue;
      }
      const groups = [...trimmed.slice(trimmed.lastIndexOf(')')).matchAll(/#(\d+)/g)].map((m) => m[1]);
      const fn: Fn = {
        name: nameMatch[1],
        header: trimmed,
        blocks: [],
        isEntryPoint: trimmed.includes('"entry_point"'),
      };
      (fn as Fn & { _groups?: string[] })._groups = groups;
      current = { fn, block: undefined, line: lineNo };
      continue;
    }
    if (trimmed.startsWith('declare ')) {
      const m = /@([-A-Za-z$._0-9]+)/.exec(trimmed);
      if (m) declares.set(m[1], trimmed);
      continue;
    }
    if (trimmed.startsWith('attributes #')) {
      const m = /^attributes #(\d+)\s*=\s*\{(.*)\}/.exec(trimmed);
      if (m && m[2].includes('"entry_point"')) entryGroups.add(m[1]);
      trailer.push(trimmed);
      continue;
    }
    if (trimmed.startsWith('!') || functions.length > 0) {
      trailer.push(raw);
      continue;
    }
    preamble.push(raw);
  }

  if (current) {
    diagnostics.push({ severity: 'error', code: 'E0301', message: `function @${current.fn.name} is missing its closing '}'`, span: { line: current.line, col: 1, length: 6 } });
  }
  if (diagnostics.length) throw new CompileError(diagnostics, source, fileName);

  // Register names written by our front-end (`; qubits: a[0] a[1] ...`), so messages stay readable.
  const names = (key: string) => {
    const line = preamble.find((l) => l.startsWith(`; ${key}: `));
    return line ? line.slice(key.length + 4).trim().split(/\s+/).filter(Boolean) : undefined;
  };
  for (const fn of functions) {
    if (fn.isEntryPoint || functions.length === 1) {
      fn.qubitNames = names('qubits');
      fn.resultNames = names('results');
    }
    const groups = (fn as Fn & { _groups?: string[] })._groups ?? [];
    if (groups.some((g) => entryGroups.has(g))) fn.isEntryPoint = true;
    delete (fn as Fn & { _groups?: string[] })._groups;
  }

  // Trim leading/trailing blank lines of the preamble/trailer; the emitter adds its own spacing.
  while (preamble.length && preamble[preamble.length - 1].trim() === '') preamble.pop();
  while (trailer.length && trailer[0].trim() === '') trailer.shift();

  return { preamble, functions, declares, trailer, style: detectStyle(source) };
}

function detectStyle(source: string): ModuleStyle {
  const opaquePointers = !/%(Qubit|Result)\s*\*/.test(source);
  const callees = [...source.matchAll(/@__quantum__qis__(\w+?)(?=\s*\()/g)].map((m) => m[1]);
  const plain = callees.some((c) => !c.endsWith('__body') && !c.endsWith('__adj'));
  const body = callees.some((c) => c.endsWith('__body'));
  return { opaquePointers, bodySuffix: body || !plain };
}
