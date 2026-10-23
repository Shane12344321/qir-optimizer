# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: React 18 + Vite + TypeScript, chosen because the optimizer engine is already TypeScript and runs unchanged in the browser. The walkthrough must work offline as a static build.

## Users

- **Primary: the evaluator.** A compiler-design professor (BCSE307 Review 3) who knows compilers well and does not know quantum computing. She asks three questions: is there something new, how does it differ from existing research, and what is the quantum part.
- **Secondary: the team of four students.** They know nothing about the project and present it entirely from this walkthrough. They need speaker-ready explanations, the reasoning behind each claim, and answers for the viva.

## Product Purpose

An interactive, self-contained walkthrough of the "QIR Optimizer" project: a small quantum compiler (OpenQASM → QIR/LLVM IR) whose centrepiece is a hybrid-aware, self-verifying optimizer. Success means the evaluator understands the problem, sees the real engine run live on inputs she picks, believes the novelty claim, and awards marks across the Review 3 rubric. It also means the team can present and defend it with no other material.

## Positioning

Existing quantum optimizers (Qiskit, tket) see only the circuit, and QIR-level tools (QAT) run classical LLVM passes with no quantum meaning. This project reasons across both. Its quantum constant propagation feeds classical constant folding, branch folding and dead-block removal directly on standard QIR, and every rewrite is translation-validated by a built-in simulator.

Related recent work exists and must be acknowledged, not denied: Relaxed Peephole Optimization (CGO 2021), Quantum Constant Propagation, Branch-Aware QCP (2026), and hybrid de-quantization in MQT Core (2026). The claim is about the layer (QIR/LLVM IR, Adaptive Profile CFG) and the built-in validation. It is not a claim to have invented the idea.

## Operating Context

- Review 3 rubric (10 marks): completeness 2.5, live demo 1.5, testing/results 1.5, technical depth 1.0, report/repo 1.0, individual contribution 1.5, presentation/viva 1.0.
- The required 7-stage demo sequence: environment, normal case, boundary case, failure case, internal evidence, evaluation, evaluator-selected input.
- 18–22 minutes of presentation followed by viva; it may be projected or read alone.

## Capabilities and Constraints

- The real engine runs in the page: QASM lexer/parser/semantic analysis, QIR generation, QIR parsing, the dependence DAG, peephole passes, hybrid constant propagation, CFG simplification, profile lowering, state-vector simulation, equivalence checking, noisy sampling and the naive (unsafe) optimizer.
- LLVM validation (clang/llvm-as) runs only on the command line, not in the browser.
- Simulation is limited to about 20 qubits in the browser.
- Member names for Members 2–4 are undecided; use role placeholders (Member 1 is Shane, lead/integration).

## Evidence on Hand

- Benchmark results: `bench/results.json`, produced by `qiropt bench` (22 programs, ablation of three pass configurations, ESP and simulated success).
- Test suite: 65 tests covering exhaustive rule soundness, property tests over random programs, LLVM verification, and front-end diagnostics.
- Example programs: `src/core/examples.ts`.
- There are no real-hardware runs. Any hardware result would be fabricated; the noise model is simulated and must be labelled as such.

## Product Principles

1. Prove, don't claim. Every number on screen is computed by the engine or comes from the benchmark file.
2. Compiler vocabulary first, quantum second: each rewrite is named by the classical technique it instantiates.
3. Honest positioning: name the closest prior work and state precisely what is different.
4. Self-contained: a presenter with no background can deliver it from the page alone.
