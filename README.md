# QIR Optimizer

A hybrid-aware, self-verifying optimizer for the **Quantum Intermediate Representation** (QIR), the LLVM-IR form of quantum programs. BCSE307 Compiler Design, Project Review 3.

```
OpenQASM 2.0 ─► lexer ─► parser ─► semantic analysis ─► QIR generation ─┐
                                                                         ▼
any QIR (.ll) ─► QIR reader ─► wire dependences ─► passes to a fixed point ─► QIR
                               peephole · hybrid constant propagation · CFG · profile lowering
                                                                         │
                      exact simulator ◄── translation validation of every rewrite
```

- **Peephole along qubit wires.** Inverse cancellation, commutation-aware cancellation and rotation/phase merging. Searches follow each qubit's wire rather than the text, and SSA qubits are treated as possibly aliasing.
- **Hybrid constant propagation.** Sparse conditional dataflow over QIR's CFG, tracking qubit basis states, measurement results and SSA values together. A qubit known to be in a basis state becomes a constant measurement, then a folded `icmp`, a folded `br`, a deleted block and merged blocks. Finally the module is lowered from the Adaptive to the Base Profile.
- **Translation validation.** Every rewrite is checked by exact state-vector simulation (all measurement branches). Every refused rewrite records why.
- **LLVM as the oracle.** Every emitted module is run through LLVM's parser and verifier (`clang -x ir` or `llvm-as`).

## Quick start

```bash
npm ci
npm test                                   # 65 tests: rule soundness, property tests, LLVM verification
npx tsx src/cli/main.ts opt example:adder  # optimize and explain every rewrite
npm run dev                                # interactive walkthrough at http://localhost:5188
```

### CLI

```bash
npx tsx src/cli/main.ts compile prog.qasm -o prog.ll
npx tsx src/cli/main.ts opt prog.ll -o out.ll --trace trace.json   # --preset adjacent-only|peephole|full
npx tsx src/cli/main.ts verify prog.ll out.ll
npx tsx src/cli/main.ts run prog.qasm --noise
npx tsx src/cli/main.ts bench                                      # ablation study → bench/results.md
npx tsx src/cli/main.ts examples
```

### Walkthrough

`web/` is the Review 3 presentation: 17 full-screen scenes, each with one idea, a few short points and a live figure running the real engine. Move with ← / → (or Space), and press `N` to toggle the speaker notes. The full technical write-up (algorithms, related work, every benchmark, tests, viva answers, references) is a collapsible appendix at the end.

- `npm run dev` serves it locally.
- `npm run build` writes a static site to `dist/`.
- `npm run build:single` writes one self-contained `dist-single/index.html` that opens from disk with no network.
- `npm run evidence` re-runs the tests and benchmarks and refreshes the numbers the walkthrough shows (`web/src/data/`).

## Layout

| Path | Contents |
|---|---|
| `src/core/qasm/` | lexer, parser, AST, semantic analysis, QIR generation |
| `src/core/qir/` | QIR in-memory IR, reader, emitter |
| `src/core/opt/` | peephole, hybrid constant propagation, CFG simplification, profile lowering, pass manager, naive (unsafe) baseline |
| `src/core/sim/` | state-vector simulator, QIR interpreter with branching and noise, equivalence checker |
| `src/core/bench.ts`, `random.ts` | benchmark suite and random program generator |
| `src/cli/` | `qiropt` command line, LLVM verification |
| `tests/` | Vitest suites |
| `web/` | walkthrough (React + Vite) |
| `docs/spec.md` | design specification |

## Limitations

The optimizer rewrites locally within basic blocks, and its quantum domain knows basis states only (less precise than QCP). It does no phase-polynomial reasoning. Validation is exact and therefore stops at about 20 qubits. There is no hardware mapping, and success rates come from a simulated noise model, not hardware. See §12 of the walkthrough.
