// Every change the optimizer makes — and every change it refuses to make — is
// recorded as an event, so each line of the output can be explained.

export type RuleId =
  | 'cancel-self-inverse'
  | 'cancel-adjoint'
  | 'cancel-commuted'
  | 'merge-rotation'
  | 'fold-phase'
  | 'qconst-dead-control'
  | 'qconst-strength-reduce'
  | 'qconst-phase-drop'
  | 'qconst-reset'
  | 'qconst-swap'
  | 'fold-read-result'
  | 'fold-classical'
  | 'fold-branch'
  | 'remove-unreachable'
  | 'merge-blocks'
  | 'lower-profile'
  | 'naive-cancel'
  | 'naive-merge';

export type PassId = 'peephole' | 'qconst' | 'cfg' | 'target' | 'naive';

export interface RuleInfo {
  title: string;
  /** The classical compiler technique this rule is an instance of. */
  concept: string;
  pass: PassId;
}

export const RULES: Record<RuleId, RuleInfo> = {
  'cancel-self-inverse': { title: 'Self-inverse cancellation', concept: 'Peephole optimization · algebraic simplification', pass: 'peephole' },
  'cancel-adjoint': { title: 'Adjoint-pair cancellation', concept: 'Peephole optimization · algebraic simplification', pass: 'peephole' },
  'cancel-commuted': { title: 'Commutation-aware cancellation', concept: 'Code motion over the dependence DAG', pass: 'peephole' },
  'merge-rotation': { title: 'Rotation merging', concept: 'Constant folding (angle arithmetic)', pass: 'peephole' },
  'fold-phase': { title: 'Phase-gate folding', concept: 'Constant folding (phase arithmetic)', pass: 'peephole' },
  'qconst-dead-control': { title: 'Never-firing controlled gate', concept: 'Constant propagation → dead-code elimination', pass: 'qconst' },
  'qconst-strength-reduce': { title: 'Always-firing controlled gate', concept: 'Strength reduction', pass: 'qconst' },
  'qconst-phase-drop': { title: 'Phase on a known state', concept: 'Constant propagation → dead-code elimination', pass: 'qconst' },
  'qconst-reset': { title: 'Reset of a qubit already in |0⟩', concept: 'Redundant-store elimination', pass: 'qconst' },
  'qconst-swap': { title: 'Swap of identical states', concept: 'Constant propagation → dead-code elimination', pass: 'qconst' },
  'fold-read-result': { title: 'Deterministic measurement', concept: 'Constant propagation across the quantum→classical boundary', pass: 'qconst' },
  'fold-classical': { title: 'Classical constant folding', concept: 'Constant folding', pass: 'qconst' },
  'fold-branch': { title: 'Branch folding', concept: 'Sparse conditional constant propagation', pass: 'qconst' },
  'remove-unreachable': { title: 'Unreachable block removal', concept: 'Unreachable-code elimination', pass: 'cfg' },
  'merge-blocks': { title: 'Basic-block merging', concept: 'Control-flow-graph simplification', pass: 'cfg' },
  'lower-profile': { title: 'Profile lowering (Adaptive → Base)', concept: 'Target legalization', pass: 'target' },
  'naive-cancel': { title: 'Naive cancellation (unsafe)', concept: 'Pattern matching without dependence analysis', pass: 'naive' },
  'naive-merge': { title: 'Naive merging (unsafe)', concept: 'Pattern matching without dependence analysis', pass: 'naive' },
};

export type BlockReason = 'measurement' | 'reset' | 'unknown-call' | 'alias' | 'non-commuting' | 'superposition';

export const BLOCK_REASONS: Record<BlockReason, string> = {
  measurement: 'a measurement in between observes the qubit',
  reset: 'a reset in between overwrites the qubit',
  'unknown-call': 'an unknown function call might touch any qubit',
  alias: 'the qubits might be the same (possible aliasing)',
  'non-commuting': 'a gate in between does not commute',
  superposition: 'the value depends on a qubit in superposition',
};

export interface RewriteEvent {
  kind: 'rewrite';
  rule: RuleId;
  fn: string;
  block: string;
  /** Instruction ids removed by the rewrite. */
  removed: number[];
  /** Instruction ids changed in place (e.g. a merged rotation). */
  changed: number[];
  /** Instruction ids newly inserted. */
  added: number[];
  message: string;
  /** Filled in by the pipeline: output lines before/after this step. */
  linesBefore?: number[];
  linesAfter?: number[];
  srcLines?: number[];
  /** Filled in when per-rewrite validation is enabled. */
  validated?: { equivalent: boolean; fidelity: number };
}

export interface RefusalEvent {
  kind: 'refusal';
  rule: RuleId;
  fn: string;
  block: string;
  /** The pair (or instruction) that could not be rewritten. */
  ids: number[];
  blocker?: number;
  reason: BlockReason;
  message: string;
  linesBefore?: number[];
  srcLines?: number[];
}

export type TraceEvent = RewriteEvent | RefusalEvent;

export type Emit = (e: TraceEvent) => void;
