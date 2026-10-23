import { describe, expect, it } from 'vitest';
import {
  checkEquivalence, emitModule, type GateInstr, loadProgram, type Module, optimize, type OptimizeOptions, outputDistribution, parseQir,
} from '../src/core';
import { EXAMPLES, exampleById } from '../src/core/examples';
import { qasm } from './helpers';

const PEEPHOLE: OptimizeOptions = { qconst: false, cfg: false };

function gates(m: Module): string[] {
  return m.functions.flatMap((f) => f.blocks.flatMap((b) => b.instrs.filter((i): i is GateInstr => i.op === 'gate').map((g) => `${g.gate}(${g.qubits.map((q) => (q.kind === 'static' ? q.index : q.name)).join(',')})`)));
}

function run(n: number, body: string, opts: OptimizeOptions = PEEPHOLE, cregs = 0) {
  const input = qasm(n, body, cregs);
  const r = optimize(input, { ...opts, validate: 'final' });
  expect(r.validation!.equivalent, r.validation!.detail).toBe(true);
  return { r, gates: gates(r.module), rules: r.rewrites.map((e) => e.rule) };
}

describe('peephole: inverse cancellation', () => {
  it('cancels self-inverse and adjoint pairs', () => {
    const { gates: g, rules } = run(2, 'h q[0]; h q[0]; s q[1]; sdg q[1]; cx q[0], q[1]; cx q[0], q[1]; t q[0];');
    expect(g).toEqual(['t(0)']);
    expect(rules).toEqual(['cancel-self-inverse', 'cancel-adjoint', 'cancel-self-inverse']);
  });

  it('looks along the qubit wire, not the text: gates on other qubits do not block', () => {
    const { gates: g } = run(2, 'h q[0]; x q[1]; y q[1]; h q[0];');
    expect(g).toEqual(['x(1)', 'y(1)']);
  });

  it('cascades: H X X H disappears completely', () => {
    expect(run(1, 'h q[0]; x q[0]; x q[0]; h q[0];').gates).toEqual([]);
  });

  it('refuses when a non-commuting gate sits between', () => {
    const { gates: g, r } = run(1, 'h q[0]; x q[0]; h q[0];');
    expect(g).toEqual(['h(0)', 'x(0)', 'h(0)']);
    expect(r.refusals[0]).toMatchObject({ reason: 'non-commuting' });
  });

  it('refuses across measurement and reset', () => {
    const m = run(1, 'h q[0]; measure q[0] -> c[0]; h q[0];', PEEPHOLE, 1);
    expect(m.gates).toEqual(['h(0)', 'h(0)']);
    expect(m.r.refusals[0].reason).toBe('measurement');
    const z = run(1, 'x q[0]; reset q[0]; x q[0];', PEEPHOLE);
    expect(z.gates).toEqual(['x(0)', 'x(0)']);
    expect(z.r.refusals[0].reason).toBe('reset');
  });

  it('does not cancel CX with swapped control and target', () => {
    expect(run(2, 'cx q[0], q[1]; cx q[1], q[0];').gates).toEqual(['cx(0,1)', 'cx(1,0)']);
  });
});

describe('peephole: commutation and merging', () => {
  it('slides rotations through a CNOT control to merge them', () => {
    const { gates: g, rules } = run(2, 'h q[0]; rz(0.3) q[0]; cx q[0], q[1]; rz(-0.3) q[0];');
    expect(g).toEqual(['h(0)', 'cx(0,1)']);
    expect(rules).toEqual(['merge-rotation']);
  });

  it('cancels X across a CNOT target', () => {
    const { gates: g, rules } = run(2, 'h q[0]; x q[1]; cx q[0], q[1]; x q[1];');
    expect(g).toEqual(['h(0)', 'cx(0,1)']);
    expect(rules).toEqual(['cancel-commuted']);
  });

  it('folds phase gates: T·T = S, S·S = Z, T·T† = I', () => {
    expect(run(1, 'h q[0]; t q[0]; t q[0];').gates).toEqual(['h(0)', 's(0)']);
    expect(run(1, 'h q[0]; s q[0]; s q[0];').gates).toEqual(['h(0)', 'z(0)']);
    expect(run(1, 'h q[0]; t q[0]; rz(-pi/4) q[0];').gates).toEqual(['h(0)']);
  });

  it('merges rotations that sum to a full turn into nothing', () => {
    expect(run(1, 'h q[0]; rx(pi) q[0]; rx(pi) q[0];').gates).toEqual(['h(0)']);
  });

  it('respects possible aliasing between SSA qubits', () => {
    const r = optimize(loadProgram(exampleById('legacy-qir').source).module);
    expect(gates(r.module)).toEqual(['h(%q0)', 'x(%q1)', 'h(%q0)']);
    expect(r.refusals.map((e) => e.reason)).toEqual(['alias']);
  });
});

describe('hybrid constant propagation', () => {
  it('removes controlled gates whose control is provably |0⟩ and reduces those provably |1⟩', () => {
    const { gates: g, rules } = run(3, 'cx q[0], q[1]; x q[0]; cx q[0], q[2]; h q[1];', {});
    expect(g).toEqual(['x(0)', 'x(2)', 'h(1)']);
    expect(rules).toContain('qconst-dead-control');
    expect(rules).toContain('qconst-strength-reduce');
  });

  it('drops phase gates acting on known basis states', () => {
    expect(run(1, 'z q[0]; t q[0]; x q[0]; rz(0.4) q[0];', {}).gates).toEqual(['x(0)']);
  });

  it('keeps gates whose controls are in superposition', () => {
    expect(run(2, 'h q[0]; cx q[0], q[1];', {}).gates).toEqual(['h(0)', 'cx(0,1)']);
  });

  it('removes a reset of a qubit already in |0⟩', () => {
    const { r } = run(1, 'reset q[0]; h q[0];', {});
    expect(r.rewrites[0].rule).toBe('qconst-reset');
  });

  it('folds a branch on a deterministic measurement and deletes the dead block', () => {
    const { r, gates: g } = run(2, 'x q[0]; measure q[0] -> c[0]; if (c == 0) h q[1]; if (c == 1) x q[1];', {}, 1);
    expect(g).toEqual(['x(0)', 'x(1)']);
    expect(r.after.blocks).toBe(1);
    const rules = new Set(r.rewrites.map((e) => e.rule));
    for (const rule of ['fold-read-result', 'fold-classical', 'fold-branch', 'remove-unreachable', 'merge-blocks']) {
      expect(rules, rule).toContain(rule);
    }
  });

  it('does not fold a branch on a random measurement', () => {
    const { r } = run(2, 'h q[0]; measure q[0] -> c[0]; if (c == 1) x q[1];', {}, 1);
    expect(r.after.blocks).toBe(r.before.blocks);
    expect(r.refusals.some((e) => e.reason === 'superposition')).toBe(true);
  });

  it('makes no assumptions about qubits of non-entry functions', () => {
    const src = `define void @f(ptr %a) {\nentry:\n  call void @__quantum__qis__cnot__body(ptr null, ptr inttoptr (i64 1 to ptr))\n  ret void\n}\n`;
    const r = optimize(parseQir(src));
    expect(r.after.gates).toBe(1);
  });

  it('lowers a fully folded program from the Adaptive to the Base Profile', () => {
    const r = optimize(loadProgram(exampleById('adder').source).module);
    expect(r.inputText).toContain('"qir_profiles"="adaptive_profile"');
    expect(r.outputText).toContain('"qir_profiles"="base_profile"');
    expect(r.outputText).not.toContain('int_computations');
    expect(r.rewrites.at(-1)!.rule).toBe('lower-profile');
  });
});

describe('examples', () => {
  it.each(EXAMPLES.map((e) => [e.id]))('%s: optimized program is equivalent and never larger', (id) => {
    const input = loadProgram(exampleById(id).source).module;
    const r = optimize(input, { validate: 'each', snapshots: true });
    expect(r.validation!.equivalent, r.validation!.detail).toBe(true);
    for (const e of r.rewrites) {
      if (e.validated) expect(e.validated.equivalent, e.message).toBe(true);
    }
    expect(r.after.gates).toBeLessThanOrEqual(r.before.gates);
    // Replay: the last snapshot is the final output.
    if (r.snapshots.length) expect(r.snapshots.at(-1)!.text).toBe(r.outputText);
  });

  it('adder computes 3 + 5 = 8 entirely at compile time', () => {
    const r = optimize(loadProgram(exampleById('adder').source).module);
    expect(r.after.gates).toBe(3);
    expect(r.after.twoQubit).toBe(0);
    expect([...outputDistribution(r.module)]).toEqual([['1000 0 0', 1]]);
  });

  it('grover still finds box 101 after optimization', () => {
    const r = optimize(loadProgram(exampleById('grover').source).module);
    const dist = outputDistribution(r.module);
    expect(dist.get('101')!).toBeGreaterThan(0.94);
    expect(r.after.gates).toBeLessThan(r.before.gates);
  });

  it('teleportation keeps both corrections and always reads out 0', () => {
    const r = optimize(loadProgram(exampleById('teleport').source).module);
    expect(r.after.blocks).toBe(r.before.blocks);
    for (const [k, p] of outputDistribution(r.module)) if (p > 1e-9) expect(k.endsWith(' 0')).toBe(true);
  });
});

describe('the equivalence checker catches real bugs', () => {
  it('flags a wrong rewrite', () => {
    const a = qasm(1, 'h q[0]; x q[0]; h q[0];');
    const b = qasm(1, 'x q[0];');
    const v = checkEquivalence(a, b);
    expect(v.equivalent).toBe(false);
  });

  it('accepts a global phase difference', () => {
    expect(checkEquivalence(qasm(1, 'h q[0]; z q[0];'), qasm(1, 'h q[0]; rz(pi) q[0];'), 'unitary').equivalent).toBe(true);
  });

  it('round-trips emitted QIR through the parser unchanged', () => {
    for (const e of EXAMPLES) {
      const m = loadProgram(e.source).module;
      const text = emitModule(m).text;
      expect(emitModule(parseQir(text)).text).toBe(text);
    }
  });
});
