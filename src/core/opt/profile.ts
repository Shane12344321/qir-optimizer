// Target legalization: once every classical branch has been folded away, an
// Adaptive Profile program may satisfy the stricter QIR Base Profile — one
// block, no classical computation, and every measurement at the end. Base
// Profile programs run on hardware without mid-circuit feed-forward.

import type { Module } from '../qir/ir';
import { mainFunction } from '../sim/interp';
import type { Emit } from './trace';

export function fitsBaseProfile(m: Module): boolean {
  const fn = mainFunction(m);
  if (fn.blocks.length !== 1) return false;
  const measured = new Set<string>();
  for (const i of fn.blocks[0].instrs) {
    if (i.op === 'read_result' || i.op === 'classical' || i.op === 'br' || i.op === 'reset' || i.op === 'opaque') return false;
    if (i.op === 'measure') {
      measured.add(JSON.stringify(i.qubit));
      continue;
    }
    if (i.op === 'gate' && (measured.size > 0)) return false; // gates after a measurement = mid-circuit
  }
  return true;
}

export function lowerProfile(m: Module, emit: Emit): boolean {
  const idx = m.trailer.findIndex((l) => l.includes('"qir_profiles"="adaptive_profile"'));
  if (idx < 0 || !fitsBaseProfile(m)) return false;
  m.trailer[idx] = m.trailer[idx].replace('"qir_profiles"="adaptive_profile"', '"qir_profiles"="base_profile"');
  // Base Profile has no integer computations: drop that module flag and the now-unused declaration.
  const flagLine = m.trailer.findIndex((l) => /!"int_computations"/.test(l));
  if (flagLine >= 0) {
    const id = /^!(\d+)/.exec(m.trailer[flagLine])?.[1];
    m.trailer.splice(flagLine, 1);
    if (id !== undefined) {
      m.trailer = m.trailer.map((l) =>
        l.startsWith('!llvm.module.flags') ? l.replace(new RegExp(`,\\s*!${id}(?=[,}])|!${id},\\s*`), '') : l,
      );
    }
  }
  m.declares.delete('__quantum__rt__read_result');
  const fn = mainFunction(m);
  emit({
    kind: 'rewrite', rule: 'lower-profile', fn: fn.name, block: fn.blocks[0].label, removed: [], changed: [], added: [],
    message: 'no branches or mid-circuit measurements remain: the program now fits the QIR Base Profile and can run on hardware without feed-forward',
  });
  return true;
}
