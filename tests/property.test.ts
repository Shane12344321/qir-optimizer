// Property-based testing: thousands of random programs, each optimized and
// checked against the original by the simulator.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkEquivalence, CompileError, compileQasm, naiveOptimize, optimize, parseQir } from '../src/core';
import { randomProgram } from '../src/core/random';

const RUNS = Number(process.env.PROPERTY_RUNS ?? 400);

describe('random programs', () => {
  it('peephole passes preserve the full unitary of straight-line circuits', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 1, max: 40 }), fc.integer(), (qubits, gates, seed) => {
        const src = randomProgram({ qubits, gates, seed, redundancy: 0.5 }).replace('measure q -> c;\n', '');
        const input = compileQasm(src).module;
        const r = optimize(input, { qconst: false, cfg: false });
        const v = checkEquivalence(input, r.module, 'unitary');
        expect(v.equivalent, `${v.detail}\n${src}`).toBe(true);
        expect(r.after.gates).toBeLessThanOrEqual(r.before.gates);
      }),
      { numRuns: RUNS },
    );
  });

  it('the full pipeline preserves program semantics, including measurement and branching', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 1, max: 40 }), fc.integer(), (qubits, gates, seed) => {
        const src = randomProgram({ qubits, gates, seed, redundancy: 0.4, dynamic: true });
        const input = compileQasm(src).module;
        const r = optimize(input);
        const v = checkEquivalence(input, r.module);
        expect(v.equivalent, `${v.detail}\n${src}`).toBe(true);
        expect(r.after.gates).toBeLessThanOrEqual(r.before.gates);
      }),
      { numRuns: RUNS },
    );
  });

  it('every rewrite step is individually valid (translation validation)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.integer({ min: 1, max: 25 }), fc.integer(), (qubits, gates, seed) => {
        const src = randomProgram({ qubits, gates, seed, redundancy: 0.5, dynamic: true });
        const r = optimize(compileQasm(src).module, { validate: 'each' });
        for (const e of r.rewrites) expect(e.validated?.equivalent, `${e.message}\n${src}`).toBe(true);
      }),
      { numRuns: Math.ceil(RUNS / 4) },
    );
  });

  it('the naive optimizer is caught by the checker', () => {
    let broken = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const src = randomProgram({ qubits: 3, gates: 30, seed, redundancy: 0.3, dynamic: true });
      const input = compileQasm(src).module;
      const { module } = naiveOptimize(input);
      if (!checkEquivalence(input, module).equivalent) broken++;
    }
    // The point: unsafe rewrites are common and the checker sees them.
    expect(broken).toBeGreaterThan(50);
  });

  it('the front-end never crashes: any input either compiles or yields diagnostics', () => {
    const qasmish = fc.array(fc.constantFrom('OPENQASM 2.0;', 'qreg', 'q[2];', 'h', 'q[0]', ';', 'cx', ',', '(', ')', 'pi', '/', '->', 'measure', 'if', '==', 'gate', '{', '}', '1', 'creg c[1];', 'x'), { maxLength: 40 }).map((t) => t.join(' '));
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 200 }), qasmish), (s) => {
        try {
          compileQasm(s);
        } catch (e) {
          expect(e).toBeInstanceOf(CompileError);
        }
        try {
          parseQir(s);
        } catch (e) {
          expect(e).toBeInstanceOf(CompileError);
        }
      }),
      { numRuns: RUNS * 2 },
    );
  });
});
