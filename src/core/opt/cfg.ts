// Control-flow-graph simplification: unreachable-block removal and
// straight-line block merging. Merging matters for the quantum passes too: once
// a folded branch joins two blocks, gates that used to sit in different blocks
// become neighbours and the peephole pass can cancel them.

import type { Block, Fn } from '../qir/ir';
import type { Emit } from './trace';

function targets(b: Block): string[] {
  const t = b.instrs[b.instrs.length - 1];
  if (!t || t.op !== 'br') return [];
  return t.cond ? [t.ifTrue, t.ifFalse!] : [t.ifTrue];
}

/** CFG rewriting is only safe when every terminator is understood and no phi nodes exist. */
function cfgIsModelled(fn: Fn): boolean {
  for (const b of fn.blocks) {
    const t = b.instrs[b.instrs.length - 1];
    if (!t || (t.op !== 'br' && t.op !== 'ret')) return false;
    if (b.instrs.some((i) => i.op === 'opaque' && /=\s*phi\b|\bswitch\b|\bindirectbr\b|\binvoke\b/.test(i.text))) return false;
  }
  return true;
}

export function simplifyCfg(fn: Fn, emit: Emit): boolean {
  if (!cfgIsModelled(fn) || fn.blocks.length === 0) return false;
  let changed = false;

  // 1. Unreachable-code elimination.
  const byLabel = new Map(fn.blocks.map((b) => [b.label, b]));
  const reachable = new Set<string>();
  const stack = [fn.blocks[0].label];
  while (stack.length) {
    const l = stack.pop()!;
    if (reachable.has(l) || !byLabel.has(l)) continue;
    reachable.add(l);
    stack.push(...targets(byLabel.get(l)!));
  }
  const kept: Block[] = [];
  for (const b of fn.blocks) {
    if (reachable.has(b.label)) {
      kept.push(b);
      continue;
    }
    emit({
      kind: 'rewrite', rule: 'remove-unreachable', fn: fn.name, block: b.label,
      removed: b.instrs.map((i) => i.id), changed: [], added: [],
      message: `block %${b.label} can never execute (${b.instrs.filter((i) => i.op === 'gate').length} gate(s) removed)`,
    });
    changed = true;
  }
  fn.blocks = kept;

  // 2. Merge B into A when A ends in `br label %B` and A is B's only predecessor.
  for (;;) {
    const preds = new Map<string, string[]>();
    for (const b of fn.blocks) for (const t of targets(b)) preds.set(t, [...(preds.get(t) ?? []), b.label]);
    let merged = false;
    for (const a of fn.blocks) {
      const term = a.instrs[a.instrs.length - 1];
      if (!term || term.op !== 'br' || term.cond) continue;
      const bLabel = term.ifTrue;
      if (bLabel === a.label || bLabel === fn.blocks[0].label) continue;
      if ((preds.get(bLabel) ?? []).length !== 1) continue;
      const b = fn.blocks.find((x) => x.label === bLabel);
      if (!b) continue;
      a.instrs = [...a.instrs.slice(0, -1), ...b.instrs];
      fn.blocks = fn.blocks.filter((x) => x !== b);
      emit({
        kind: 'rewrite', rule: 'merge-blocks', fn: fn.name, block: a.label,
        removed: [term.id], changed: [], added: [],
        message: `merged block %${bLabel} into %${a.label}: straight-line code, single predecessor`,
      });
      changed = true;
      merged = true;
      break;
    }
    if (!merged) break;
  }
  return changed;
}
