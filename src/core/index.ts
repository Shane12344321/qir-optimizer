// Public API of the QIR optimizer engine. Pure TypeScript, no DOM or Node
// dependencies, so the CLI and the browser walkthrough share exactly this code.

import { CompileError, type Diagnostic } from './diagnostics';
import type { Program } from './qasm/ast';
import type { Token } from './qasm/lexer';
import { parse } from './qasm/parser';
import { generateQir } from './qasm/qirgen';
import { analyze, type CircuitProgram } from './qasm/sema';
import { emitModule } from './qir/emitter';
import type { Module } from './qir/ir';
import { parseQir } from './qir/parser';

export * from './diagnostics';
export * from './gates';
export * from './qir/ir';
export { emitModule, formatInstr } from './qir/emitter';
export { parseQir } from './qir/parser';
export { optimize, PRESETS, ALL_PASSES, stats, type OptimizeOptions, type OptimizeResult, type Snapshot, type Stats } from './opt/pipeline';
export { naiveOptimize } from './opt/naive';
export { analyze as analyzeQubits, type AState, type QVal } from './opt/qconst';
export { commutes, isInversePair } from './opt/peephole';
export * from './opt/trace';
export { checkEquivalence, type EquivResult } from './sim/equiv';
export {
  enumeratePaths, sampleShots, outputDistribution, outputSpec, formatOutput, gateStats, mainFunction, layoutOf,
  DEFAULT_NOISE, SimulationError, type NoiseModel, mulberry32,
} from './sim/interp';
export { StateVector, fidelity, blochVector } from './sim/statevector';
export type { Token } from './qasm/lexer';
export type { Program, Stmt, Expr } from './qasm/ast';
export type { CircuitProgram, COp } from './qasm/sema';

export interface CompileResult {
  tokens: Token[];
  ast: Program;
  circuit: CircuitProgram;
  module: Module;
  qir: string;
  diagnostics: Diagnostic[];
}

/** OpenQASM 2.0 → QIR. Throws CompileError (with every diagnostic) if the program has errors. */
export function compileQasm(source: string, fileName = '<input>'): CompileResult {
  const { program, diagnostics: parseDiags, tokens } = parse(source);
  const { circuit, diagnostics: semaDiags } = analyze(program);
  const diagnostics = [...parseDiags, ...semaDiags];
  if (diagnostics.some((d) => d.severity === 'error')) throw new CompileError(diagnostics, source, fileName);
  const module = generateQir(circuit);
  return { tokens, ast: program, circuit, module, qir: emitModule(module).text, diagnostics };
}

/** Accept either OpenQASM or QIR text. */
export function loadProgram(source: string, fileName = '<input>'): { module: Module; kind: 'qasm' | 'qir'; compile?: CompileResult } {
  const looksLikeQir = /^\s*(define|declare|;|%\w+\s*=\s*type|source_filename|target)/m.test(source) && !/OPENQASM/.test(source);
  if (looksLikeQir) return { module: parseQir(source, fileName), kind: 'qir' };
  const compile = compileQasm(source, fileName);
  return { module: compile.module, kind: 'qasm', compile };
}
