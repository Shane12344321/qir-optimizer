// IR generation: lower the checked OpenQASM program to a QIR module
// (Base Profile, or Adaptive Profile when the program branches on measurements).

import { formatDouble } from '../qir/emitter';
import { type Block, type Fn, freshId, type Instr, type Module, type Ref } from '../qir/ir';
import type { CircuitProgram, COp } from './sema';

const STYLE = { opaquePointers: true, bodySuffix: true };

const ref = (index: number): Ref => ({ kind: 'static', index });

function formatPtr(index: number): string {
  return index === 0 ? 'ptr null' : `ptr inttoptr (i64 ${index} to ptr)`;
}

export function generateQir(c: CircuitProgram): Module {
  let tmp = 0;
  let labelCounter = 0;
  const blocks: Block[] = [];
  let current: Block = { label: 'entry', instrs: [] };
  blocks.push(current);

  const opaqueDecls = new Map<string, string>();
  const emit = (i: Instr) => current.instrs.push(i);

  emit({ op: 'record', id: freshId(), callee: '__quantum__rt__initialize', args: 'ptr null' });

  const lowerOp = (op: COp) => {
    const srcLine = op.src.line;
    switch (op.kind) {
      case 'gate':
        emit({ op: 'gate', id: freshId(), srcLine, gate: op.gate, qubits: op.qubits.map(ref), params: op.params });
        break;
      case 'measure':
        emit({ op: 'measure', id: freshId(), srcLine, qubit: ref(op.qubit), result: ref(op.result) });
        break;
      case 'reset':
        emit({ op: 'reset', id: freshId(), srcLine, qubit: ref(op.qubit) });
        break;
      case 'barrier':
        opaqueDecls.set('__quantum__qis__barrier__body', 'declare void @__quantum__qis__barrier__body()');
        emit({ op: 'opaque', id: freshId(), srcLine, text: 'call void @__quantum__qis__barrier__body()', isCall: true, callee: '__quantum__qis__barrier__body' });
        break;
      case 'opaque': {
        const callee = `__quantum__qis__${op.name}__body`;
        const sig = [...op.params.map(() => 'double'), ...op.qubits.map(() => 'ptr')].join(', ');
        opaqueDecls.set(callee, `declare void @${callee}(${sig})`);
        const args = [...op.params.map((p) => `double ${formatDouble(p)}`), ...op.qubits.map(formatPtr)].join(', ');
        emit({ op: 'opaque', id: freshId(), srcLine, text: `call void @${callee}(${args})`, isCall: true, callee });
        break;
      }
      case 'if': {
        // Read each bit of the classical register and assemble it into an integer.
        let acc: string | undefined;
        for (let b = 0; b < op.creg.size; b++) {
          const bit = `%${op.creg.name}.b${b}.${tmp++}`;
          emit({ op: 'read_result', id: freshId(), srcLine, dest: bit, result: ref(op.creg.offset + b) });
          const wide = `%${op.creg.name}.z${b}.${tmp++}`;
          emit({ op: 'classical', id: freshId(), srcLine, dest: wide, opcode: 'zext', type: 'i1', toType: 'i64', operands: [{ kind: 'local', type: 'i1', name: bit }] });
          let term = wide;
          if (b > 0) {
            term = `%${op.creg.name}.s${b}.${tmp++}`;
            emit({ op: 'classical', id: freshId(), srcLine, dest: term, opcode: 'shl', type: 'i64', operands: [{ kind: 'local', type: 'i64', name: wide }, { kind: 'const', type: 'i64', value: b }] });
          }
          if (acc === undefined) acc = term;
          else {
            const next = `%${op.creg.name}.v${b}.${tmp++}`;
            emit({ op: 'classical', id: freshId(), srcLine, dest: next, opcode: 'or', type: 'i64', operands: [{ kind: 'local', type: 'i64', name: acc }, { kind: 'local', type: 'i64', name: term }] });
            acc = next;
          }
        }
        const cond = `%cond.${tmp++}`;
        emit({ op: 'classical', id: freshId(), srcLine, dest: cond, opcode: 'icmp', pred: 'eq', type: 'i64', operands: [{ kind: 'local', type: 'i64', name: acc! }, { kind: 'const', type: 'i64', value: op.value }] });
        const k = labelCounter++;
        const thenLabel = `then.${k}`;
        const contLabel = `continue.${k}`;
        emit({ op: 'br', id: freshId(), srcLine, cond: { kind: 'local', type: 'i1', name: cond }, ifTrue: thenLabel, ifFalse: contLabel });
        current = { label: thenLabel, instrs: [] };
        blocks.push(current);
        for (const inner of op.body) lowerOp(inner);
        emit({ op: 'br', id: freshId(), srcLine, ifTrue: contLabel });
        current = { label: contLabel, instrs: [] };
        blocks.push(current);
        break;
      }
    }
  };

  for (const op of c.ops) lowerOp(op);

  // Output recording, one array per classical register.
  for (const reg of c.cregs) {
    emit({ op: 'record', id: freshId(), callee: '__quantum__rt__array_record_output', args: `i64 ${reg.size}, ptr null` });
    for (let b = 0; b < reg.size; b++) {
      emit({ op: 'record', id: freshId(), callee: '__quantum__rt__result_record_output', args: `${formatPtr(reg.offset + b)}, ptr null`, result: ref(reg.offset + b) });
    }
  }
  emit({ op: 'ret', id: freshId(), text: 'ret void' });

  const adaptive = isAdaptive(c.ops);
  const qubitNames = c.qregs.flatMap((r) => Array.from({ length: r.size }, (_, i) => `${r.name}[${i}]`));
  const resultNames = c.cregs.flatMap((r) => Array.from({ length: r.size }, (_, i) => `${r.name}[${i}]`));
  const fn: Fn = { name: 'main', header: 'define void @main() #0 {', blocks, isEntryPoint: true, qubitNames, resultNames };

  const declares = new Map<string, string>([
    ['__quantum__rt__initialize', 'declare void @__quantum__rt__initialize(ptr)'],
  ]);
  for (const [k, v] of opaqueDecls) declares.set(k, v);
  if (adaptive) declares.set('__quantum__rt__read_result', 'declare i1 @__quantum__rt__read_result(ptr)');
  declares.set('__quantum__rt__array_record_output', 'declare void @__quantum__rt__array_record_output(i64, ptr)');
  declares.set('__quantum__rt__result_record_output', 'declare void @__quantum__rt__result_record_output(ptr, ptr)');

  const profile = adaptive ? 'adaptive_profile' : 'base_profile';
  const flags = [
    '!0 = !{i32 1, !"qir_major_version", i32 1}',
    '!1 = !{i32 7, !"qir_minor_version", i32 0}',
    '!2 = !{i32 1, !"dynamic_qubit_management", i1 false}',
    '!3 = !{i32 1, !"dynamic_result_management", i1 false}',
  ];
  if (adaptive) flags.push('!4 = !{i32 5, !"int_computations", !{!"i64"}}');

  return {
    preamble: [
      `; ModuleID = 'qasm'`,
      `source_filename = "qasm"`,
      `; qubits: ${qubitNames.join(' ')}`,
      `; results: ${resultNames.join(' ')}`,
    ],
    functions: [fn],
    declares,
    trailer: [
      `attributes #0 = { "entry_point" "output_labeling_schema" "qir_profiles"="${profile}" "required_num_qubits"="${c.numQubits}" "required_num_results"="${c.numResults}" }`,
      'attributes #1 = { "irreversible" }',
      '',
      `!llvm.module.flags = !{${flags.map((_, i) => `!${i}`).join(', ')}}`,
      '',
      ...flags,
    ],
    style: { ...STYLE },
  };
}

function isAdaptive(ops: COp[]): boolean {
  const measured = new Set<number>();
  for (const op of ops) {
    if (op.kind === 'if' || op.kind === 'reset') return true;
    if (op.kind === 'measure') measured.add(op.qubit);
    if (op.kind === 'gate' && op.qubits.some((q) => measured.has(q))) return true;
  }
  return false;
}
