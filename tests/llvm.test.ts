// Real LLVM validation: every QIR file we emit must be accepted by LLVM's own
// parser and IR verifier. Uses `clang -x ir` (shipped with Xcode) or `llvm-as`.

import { describe, expect, it } from 'vitest';
import { compileQasm, loadProgram, optimize } from '../src/core';
import { EXAMPLES } from '../src/core/examples';
import { randomProgram } from '../src/core/random';
import { verifyWithLlvm, llvmAvailable } from '../src/cli/llvm';

describe.skipIf(!llvmAvailable())('LLVM accepts our output', () => {
  it.each(EXAMPLES.map((e) => [e.id]))('%s: input and optimized output verify', (id) => {
    const ex = EXAMPLES.find((e) => e.id === id)!;
    const r = optimize(loadProgram(ex.source).module);
    for (const text of [r.inputText, r.outputText]) {
      const v = verifyWithLlvm(text);
      expect(v.ok, v.message).toBe(true);
    }
  });

  it('random programs verify after optimization', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const src = randomProgram({ qubits: 4, gates: 30, seed, dynamic: true });
      const r = optimize(compileQasm(src).module);
      const v = verifyWithLlvm(r.outputText);
      expect(v.ok, `${v.message}\n${r.outputText}`).toBe(true);
    }
  });

  it('rejects invalid IR (the check is real)', () => {
    const v = verifyWithLlvm('define void @main() {\nentry:\n  br i1 %nope, label %a, label %b\n}\n');
    expect(v.ok).toBe(false);
    expect(v.message).toMatch(/undefined value/);
  });
});
