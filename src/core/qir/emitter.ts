// QIR emitter: turns the in-memory module back into LLVM IR text.

import { formatAngle, GATES, type GateName } from '../gates';
import type { Instr, Module, ModuleStyle, Ref, Value } from './ir';

const QIS_BASE: Record<GateName, string> = {
  h: 'h', x: 'x', y: 'y', z: 'z', s: 's', sdg: 's__adj', t: 't', tdg: 't__adj',
  rx: 'rx', ry: 'ry', rz: 'rz', cx: 'cnot', cz: 'cz', swap: 'swap', ccx: 'ccx',
};

export function gateCallee(g: GateName, style: ModuleStyle): string {
  const base = QIS_BASE[g];
  if (base.endsWith('__adj')) return `__quantum__qis__${base}`;
  return style.bodySuffix ? `__quantum__qis__${base}__body` : `__quantum__qis__${base}`;
}

export function measureCallee(style: ModuleStyle): string {
  return style.bodySuffix ? '__quantum__qis__mz__body' : '__quantum__qis__mz';
}

export function resetCallee(style: ModuleStyle): string {
  return style.bodySuffix ? '__quantum__qis__reset__body' : '__quantum__qis__reset';
}

function ptrType(kind: 'Qubit' | 'Result', style: ModuleStyle): string {
  return style.opaquePointers ? 'ptr' : `%${kind}*`;
}

export function formatRef(r: Ref, kind: 'Qubit' | 'Result', style: ModuleStyle): string {
  const ty = ptrType(kind, style);
  if (r.kind === 'dynamic') return `${ty} ${r.name}`;
  if (r.index === 0) return `${ty} null`;
  return `${ty} inttoptr (i64 ${r.index} to ${ty})`;
}

/** LLVM requires exactly representable decimal FP literals, so non-trivial doubles are written in hex. */
export function formatDouble(x: number): string {
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return `${x}.0`;
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const hex = [...new Uint8Array(buf.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `0x${hex}`;
}

function formatValue(v: Value): string {
  if (v.kind === 'local') return v.name;
  if (v.type === 'i1') return v.value ? 'true' : 'false';
  return String(v.value);
}

export function formatInstr(i: Instr, style: ModuleStyle): string {
  switch (i.op) {
    case 'gate': {
      const info = GATES[i.gate];
      const args = [
        ...i.params.map((p) => `double ${formatDouble(p)}`),
        ...i.qubits.map((q) => formatRef(q, 'Qubit', style)),
      ];
      const comment = info.params ? ` ; ${i.gate}(${i.params.map(formatAngle).join(', ')})` : '';
      return `call void @${gateCallee(i.gate, style)}(${args.join(', ')})${comment}`;
    }
    case 'measure': {
      const res = formatRef(i.result, 'Result', style);
      const resArg = style.opaquePointers ? res.replace(/^ptr /, 'ptr writeonly ') : res;
      return `call void @${measureCallee(style)}(${formatRef(i.qubit, 'Qubit', style)}, ${resArg})`;
    }
    case 'reset':
      return `call void @${resetCallee(style)}(${formatRef(i.qubit, 'Qubit', style)})`;
    case 'read_result':
      return `${i.dest} = call i1 @__quantum__rt__read_result(${formatRef(i.result, 'Result', style)})`;
    case 'record':
      return `call void @${i.callee}(${i.args})`;
    case 'classical': {
      const ops = i.operands.map(formatValue);
      if (i.opcode === 'zext') return `${i.dest} = zext ${i.type} ${ops[0]} to ${i.toType}`;
      if (i.opcode === 'icmp') return `${i.dest} = icmp ${i.pred} ${i.type} ${ops[0]}, ${ops[1]}`;
      return `${i.dest} = ${i.opcode} ${i.type} ${ops[0]}, ${ops[1]}`;
    }
    case 'br':
      if (!i.cond) return `br label %${i.ifTrue}`;
      return `br i1 ${formatValue(i.cond)}, label %${i.ifTrue}, label %${i.ifFalse}`;
    case 'ret':
      return i.text;
    case 'opaque':
      return i.text;
  }
}

/** The LLVM declaration for a quantum callee, used when a rewrite introduces a new gate. */
function declarationFor(callee: string, style: ModuleStyle): string | undefined {
  const q = ptrType('Qubit', style);
  const r = ptrType('Result', style);
  for (const g of Object.keys(QIS_BASE) as GateName[]) {
    if (gateCallee(g, style) === callee) {
      const info = GATES[g];
      const params = [...Array(info.params).fill('double'), ...Array(info.qubits).fill(q)];
      return `declare void @${callee}(${params.join(', ')})`;
    }
  }
  if (callee === measureCallee(style)) return `declare void @${callee}(${q}, ${style.opaquePointers ? 'ptr writeonly' : r}) #1`;
  if (callee === resetCallee(style)) return `declare void @${callee}(${q})`;
  if (callee === '__quantum__rt__read_result') return `declare i1 @${callee}(${r})`;
  return undefined;
}

function calleeOf(i: Instr, style: ModuleStyle): string | undefined {
  switch (i.op) {
    case 'gate': return gateCallee(i.gate, style);
    case 'measure': return measureCallee(style);
    case 'reset': return resetCallee(style);
    case 'read_result': return '__quantum__rt__read_result';
    default: return undefined;
  }
}

export interface EmitResult {
  text: string;
  /** Instruction id → 1-based output line. */
  lineOf: Map<number, number>;
}

export function emitModule(m: Module): EmitResult {
  const lines: string[] = [];
  const lineOf = new Map<number, number>();
  const blank = () => {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
  };
  lines.push(...m.preamble);
  const used = new Set<string>();

  for (const f of m.functions) {
    blank();
    lines.push(f.header);
    f.blocks.forEach((b, bi) => {
      if (bi > 0 || b.label !== '') lines.push(`${b.label}:`);
      for (const i of b.instrs) {
        const callee = calleeOf(i, m.style);
        if (callee) used.add(callee);
        lines.push(`  ${formatInstr(i, m.style)}`);
        lineOf.set(i.id, lines.length);
      }
    });
    lines.push('}');
  }

  const declares = new Map(m.declares);
  for (const callee of used) {
    if (!declares.has(callee)) {
      const decl = declarationFor(callee, m.style);
      if (decl) declares.set(callee, decl);
    }
  }
  blank();
  lines.push(...declares.values());
  const trailer = [...m.trailer];
  // Measurement declarations reference attribute group #1 ("irreversible"); make sure it exists.
  if ([...declares.values()].some((d) => d.endsWith('#1')) && !trailer.some((t) => t.startsWith('attributes #1 ='))) {
    const at = trailer.findIndex((t) => t.startsWith('attributes #'));
    trailer.splice(at < 0 ? 0 : at + 1, 0, 'attributes #1 = { "irreversible" }');
  }
  if (trailer.length) {
    blank();
    lines.push(...trailer);
  }
  return { text: `${lines.join('\n').trimEnd()}\n`, lineOf };
}
