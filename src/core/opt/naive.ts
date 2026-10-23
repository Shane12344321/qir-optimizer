// A deliberately UNSAFE optimizer, kept for demonstration and for testing the
// equivalence checker. It matches gates by name and operands anywhere in a
// block and ignores everything in between (other gates, measurements, resets),
// which is exactly the mistake a text-level pattern matcher makes.

import { GATES } from '../gates';
import { cloneModule, type GateInstr, type Module, mustAlias, qubitName } from '../qir/ir';
import type { RewriteEvent } from './trace';

export function naiveOptimize(input: Module): { module: Module; events: RewriteEvent[] } {
  const module = cloneModule(input);
  const events: RewriteEvent[] = [];
  for (const fn of module.functions) {
    for (const block of fn.blocks) {
      let changed = true;
      while (changed) {
        changed = false;
        const instrs = block.instrs;
        for (let i = 0; i < instrs.length && !changed; i++) {
          const g = instrs[i];
          if (g.op !== 'gate') continue;
          for (let j = i + 1; j < instrs.length; j++) {
            const k = instrs[j];
            if (k.op !== 'gate' || !sameQubits(g, k)) continue;
            const info = GATES[g.gate];
            if (k.gate === g.gate && info.inverse === g.gate) {
              instrs.splice(j, 1);
              instrs.splice(i, 1);
              events.push(ev('naive-cancel', fn.name, block.label, [g.id, k.id], [], `${g.gate.toUpperCase()} on ${g.qubits.map((q) => qubitName(fn, q)).join(', ')} "cancels" the later ${k.gate.toUpperCase()} (ignoring ${j - i - 1} instruction(s) in between)`));
              changed = true;
              break;
            }
            if (info.axis && info.axis === GATES[k.gate].axis) {
              k.params = [g.params[0] + k.params[0]];
              instrs.splice(i, 1);
              events.push(ev('naive-merge', fn.name, block.label, [g.id], [k.id], `merged two ${g.gate.toUpperCase()} rotations on ${qubitName(fn, g.qubits[0])} across ${j - i - 1} instruction(s)`));
              changed = true;
              break;
            }
          }
        }
      }
    }
  }
  return { module, events };
}

function sameQubits(a: GateInstr, b: GateInstr): boolean {
  return a.qubits.length === b.qubits.length && a.qubits.every((q, i) => mustAlias(q, b.qubits[i]));
}

function ev(rule: 'naive-cancel' | 'naive-merge', fn: string, block: string, removed: number[], changed: number[], message: string): RewriteEvent {
  return { kind: 'rewrite', rule, fn, block, removed, changed, added: [], message };
}
