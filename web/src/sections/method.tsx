import { useMemo, useState } from 'react';
import { BLOCK_REASONS, RULES, type RuleId } from '@core';
import { exampleById } from '@engine/examples';
import { Figure, Note, Say, Section, TableCap, Viva } from '../components/Bits';
import { ErrorDemo } from '../components/ErrorDemo';
import { DagView } from '../components/DagView';
import { Lattice } from '../components/Lattice';
import { NaiveDemo } from '../components/NaiveDemo';
import { Fuzzer } from '../components/Fuzzer';
import { PipelineExplorer } from '../components/PipelineExplorer';
import { Stepper } from '../components/Stepper';
import { proveRules, type ProofReport } from '../lib/proofs';
import { runProgram } from '../lib/run';

// ------------------------------------------------------------------ §4

const STAGE_ROWS = [
  ['Lexer', 'characters → tokens with spans', 'src/core/qasm/lexer.ts', 'M2'],
  ['Parser', 'recursive descent, panic-mode and phrase-level recovery', 'src/core/qasm/parser.ts', 'M2'],
  ['Semantic analysis', 'symbol tables, arity/bounds checks, constant folding, inlining', 'src/core/qasm/sema.ts', 'M2'],
  ['IR generation', 'QIR Base/Adaptive Profile, opaque pointers', 'src/core/qasm/qirgen.ts', 'M2'],
  ['QIR reader', 'LLVM IR text → module/block/instruction IR', 'src/core/qir/parser.ts', 'M3'],
  ['Peephole', 'cancellation, commutation, merging along wires', 'src/core/opt/peephole.ts', 'M3'],
  ['Hybrid const-prop', 'SCCP over qubits, results and SSA values', 'src/core/opt/qconst.ts', 'M3'],
  ['CFG simplification', 'unreachable blocks, block merging', 'src/core/opt/cfg.ts', 'M3'],
  ['Target legalization', 'Adaptive → Base Profile lowering', 'src/core/opt/profile.ts', 'M3'],
  ['Pass manager', 'fixed point, trace, per-rewrite validation', 'src/core/opt/pipeline.ts', 'M1'],
  ['Emitter', 'module → QIR text', 'src/core/qir/emitter.ts', 'M3'],
  ['Simulator', 'state vector, branch enumeration, noise', 'src/core/sim/*.ts', 'M4'],
  ['Equivalence checker', 'same outcomes, branch by branch', 'src/core/sim/equiv.ts', 'M4'],
  ['CLI · walkthrough', 'qiropt; this page', 'src/cli, web/', 'M1'],
];

export function System() {
  return (
    <Section id="system" num="4" title="System architecture" wide side={
      <>
        <Say>
          <p>Pick "Teleportation" and click through the stage tabs left to right: tokens, AST, checked IR, QIR, the wire DAG, optimized QIR, then output. Say: "Every artifact here is produced live by the code in the table below. Nothing is a screenshot."</p>
        </Say>
        <Viva q="Why TypeScript instead of a C++ LLVM pass?">
          <p>We wanted every phase to be ours, front-end included, and the same engine to run on the command line and in this page, so the demo is the product. LLVM stays in the loop as the oracle: the test suite runs every emitted module through LLVM's parser and verifier.</p>
        </Viva>
        <Note title="Size">
          <p>One engine, no runtime dependencies. The browser build and the <code>qiropt</code> command line import the same modules.</p>
        </Note>
      </>
    }>
      <p className="lede">The compiler is a classic three-part pipeline around QIR. A front-end lowers OpenQASM to QIR, a middle-end optimizes QIR to a fixed point, and a verification back-end proves the result.</p>
      <Figure n="5" caption={<>Every stage's real output for one program. The source stays on the left; choose a stage on the right. "Owner" maps each stage to a team member (§13).</>}>
        <PipelineExplorer />
      </Figure>
      <TableCap n={2}>Implementation map: every stage, its source file and its owner.</TableCap>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Stage</th><th>What it does</th><th>Source</th><th>Owner</th></tr></thead>
          <tbody>{STAGE_ROWS.map(([a, b, c, d]) => <tr key={a}><td><strong>{a}</strong></td><td>{b}</td><td><code>{c}</code></td><td>{d}</td></tr>)}</tbody>
        </table>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ §5

export function Frontend() {
  return (
    <Section id="frontend" num="5" title="Front-end: OpenQASM 2.0 to QIR" side={
      <>
        <Say>
          <p>The program in Figure 6 contains five errors. Point out that all five are reported in one run (error recovery) with rustc-style carets and hints. Then fix one live, for example change <code>hadamard</code> to <code>h</code>, to show the compiler re-running.</p>
        </Say>
        <Viva q="How does your parser recover from errors?">
          <p>Two strategies. Panic mode skips to the next <code>;</code> or <code>{'}'}</code> and resumes. Phrase-level recovery handles a missing <code>;</code> at a line end: we report it, insert it and carry on, so the next statement is still parsed and checked.</p>
        </Viva>
        <Viva q="How are user-defined gates compiled?">
          <p>By inline expansion at the call site, with parameter substitution and constant folding of the angle expressions. QASM 2 has no controlled user gates, so dropping global phases during lowering is sound.</p>
        </Viva>
      </>
    }>
      <p className="lede">A hand-written lexer and recursive-descent parser build a typed AST. Semantic analysis resolves it against symbol tables, and IR generation lowers the checked program to QIR.</p>
      <p>Semantic analysis catches undefined and duplicate names (suggesting the closest match), wrong numbers of parameters or qubits, out-of-range indices, a qubit used twice in one gate, register-size mismatches and division by zero in angle expressions. Library gates such as <code>u3</code>, <code>cu1</code> and <code>ch</code> are lowered to a small native set (H, X, Y, Z, S, T, the three rotations, CX, CZ, SWAP and CCX). The test suite checks every lowering against the gate it replaces.</p>
      <Figure n="6" caption={<>Edit the program; the front-end re-runs on every keystroke. All diagnostics from one run are listed.</>}>
        <ErrorDemo />
      </Figure>
    </Section>
  );
}

// ------------------------------------------------------------------ §6

const RULE_ROWS: [string, string, RuleId][] = [
  ['H·H, X·X, CX·CX, … do nothing', 'same gate twice on the same qubits', 'cancel-self-inverse'],
  ['S·S†, T·T† do nothing', 'a gate followed by its inverse', 'cancel-adjoint'],
  ['Rz(a)·Rz(b) = Rz(a + b)', 'same rotation axis; removed if the total is a full turn', 'merge-rotation'],
  ['T·T = S, S·S = Z', 'phase gates add up', 'fold-phase'],
  ['slide past a commuting gate, then apply a rule above', 'see the commutation rule below', 'cancel-commuted'],
];

export function Peephole() {
  const basics = useMemo(() => runProgram(exampleById('basics').source), []);
  const legacy = useMemo(() => runProgram(exampleById('legacy-qir').source), []);
  const [proof, setProof] = useState<ProofReport | null>(null);
  const [proving, setProving] = useState(false);
  return (
    <Section id="peephole" num="6" title="Dependence along qubit wires and peephole rewriting" wide side={
      <>
        <Say>
          <p>Step through Figure 8. Stop at the merge: "these two rotations are three instructions apart in the text, but the CNOT between them only touches this wire as a control, and Z-rotations commute with a control. So they meet, sum to zero and vanish." Then show the two refusals at the end and read their reasons.</p>
          <p>Finish by pressing "Run the proof" under the commutation rule.</p>
        </Say>
        <Viva q="Is your commutation rule complete?">
          <p>No, it is sufficient, not necessary. It never claims a false commutation (checked exhaustively), but it misses some true ones, for example identities that only hold for specific angles. Missing an optimization is safe; a false claim is not.</p>
        </Viva>
        <Viva q="What does aliasing mean for qubits?">
          <p>A function that takes <code>%q0</code> and <code>%q1</code> as parameters may be called with the same qubit twice. We therefore treat distinct SSA qubits as possibly equal, and gates on them block each other unless they commute regardless (Figure 9). Static addresses are compared exactly.</p>
        </Viva>
      </>
    }>
      <p className="lede">Review 2's prototype cancelled two gates only when their lines were textually adjacent. The optimizer now searches along each qubit's wire, so operations on unrelated qubits never block a rewrite, and it slides gates past one another when they provably commute.</p>
      <div className="defn">
        <b>Dependence.</b> Within a basic block, two instructions depend on each other if they may touch the same qubit. An unknown call touches every qubit. Two gates can be rewritten together only if nothing between them depends on the first one, or what is in between can be swapped past it.
      </div>
      <Figure n="7" caption={<>The dependence DAG of the "basics" program: one node per quantum operation, one edge per wire between consecutive operations. A rewrite partner is searched along these edges rather than along the text.</>}>
        <div className="plate"><div className="plate-body">{basics.ok && <DagView module={basics.input} />}</div></div>
      </Figure>
      <TableCap n={3}>Peephole identities and the classical technique each one instantiates.</TableCap>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Identity</th><th>Condition</th><th>Rule</th><th>Classical counterpart</th></tr></thead>
          <tbody>{RULE_ROWS.map(([tex, cond, id]) => <tr key={id}><td>{tex}</td><td>{cond}</td><td>{RULES[id].title}</td><td>{RULES[id].concept}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="defn">
        <b>Commutation rule.</b> Two gates may swap places if, on every qubit they share, they act in the same way: both only change the phase (Rz, S, T, Z, or the control of a CX), or both only flip the value (X, Rx, or the target of a CX). H and SWAP never move. The rule can miss some legal swaps, but it never allows an illegal one. That is checked by machine, below.
        <div className="plate" style={{ marginTop: 12 }}>
          <div className="plate-bar">
            <strong>Machine check</strong>
            <span className="muted">every pair of native gates in every position on 3 qubits, simulated both ways round</span>
            <span className="grow" />
            <button className="btn primary" disabled={proving} onClick={async () => { setProving(true); await proveRules(setProof); setProving(false); }}>{proving ? 'Checking…' : proof ? 'Re-run the proof' : 'Run the proof'}</button>
          </div>
          <div className="plate-body">
            {proof ? (
              <div className="stats-line">
                <span><b>{proof.pairsExamined.toLocaleString()}</b>gate pairs examined</span>
                <span><b>{proof.commuteVerified.toLocaleString()}/{proof.commuteClaims.toLocaleString()}</b>commutation claims hold</span>
                <span><b>{proof.inverseVerified}/{proof.inverseClaims}</b>inverse claims hold</span>
                <span><b>{(proof.ms / 1000).toFixed(1)}s</b>in this browser</span>
              </div>
            ) : <span className="muted small">The same check runs in the test suite (<code>tests/rules.test.ts</code>). Press the button to repeat it here.</span>}
          </div>
        </div>
      </div>
      <Figure n="8" caption={<>The "basics" program, replayed one rewrite at a time. Struck gates are removed by the highlighted rule; the refusals at the end are explained.</>}>
        {basics.ok && <Stepper run={basics} codeHeight={240} />}
      </Figure>
      <Figure n="9" caption={<>The Review 1 sample, read as raw typed-pointer QIR. The obvious pairs cancel, but <code>H(%q0) X(%q1) H(%q0)</code> is kept: <code>%q0</code> and <code>%q1</code> may be the same qubit. Refusal recorded: “{legacy.ok ? legacy.result.refusals[0]?.message : ''}”.</>}>
        {legacy.ok && <Stepper run={legacy} codeHeight={200} startAtEnd />}
      </Figure>
      <p className="small muted">Refusal reasons the optimizer can report: {Object.values(BLOCK_REASONS).join('; ')}.</p>
    </Section>
  );
}

// ------------------------------------------------------------------ §7

export function Hybrid() {
  const [variant, setVariant] = useState<'adder' | 'adder-superposition'>('adder');
  const run = useMemo(() => runProgram(exampleById(variant).source), [variant]);
  return (
    <Section id="hybrid" num="7" title="Hybrid quantum–classical constant propagation" wide side={
      <>
        <Say>
          <p>This is the centrepiece. Explain the three facts per qubit (Figure 10), read two rows of Table 4, then replay Figure 11 and narrate the chain: CX with a known control becomes X or vanishes, the carry qubit is proven |0⟩, its measurement is a constant, <code>icmp</code> folds, the branch folds, the block is unreachable, the blocks merge and the profile lowers.</p>
          <p>Switch to "superposition". Some gates now stay, but the carry is <em>still</em> provably 0, because the high bits are classical. The analysis is precise where it can be and conservative elsewhere.</p>
        </Say>
        <Viva q="Is this analysis sound when qubits are entangled?">
          <p>Yes. A qubit is only ever marked "definitely 0" or "definitely 1" if it holds that value on every execution and is not entangled. Any gate that could entangle it with an unknown qubit marks it unknown. Entangled qubits are simply never "known".</p>
        </Viva>
        <Viva q="Does it terminate? What is the complexity?">
          <p>Yes. Each tracked value can only move from "not reached" to "known" to "unknown", so it changes at most twice, and the worklist algorithm is linear in the size of the CFG times the number of tracked values.</p>
        </Viva>
        <Viva q="Isn't deleting a provably-dead error check dangerous on real hardware?">
          <p>Semantics are defined for ideal execution, as in classical compilers, which also assume the hardware works. Code that deliberately checks for hardware faults must hide that from the optimizer, for example behind an opaque call. We discuss this in §12.</p>
        </Viva>
      </>
    }>
      <p className="lede">A forward dataflow analysis over the CFG tracks what is known about every qubit, measurement result and classical SSA value. Facts flow from the quantum part of the program into the classical part, where ordinary constant folding takes over.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)', gap: 40, alignItems: 'start' }} className="abs-grid">
        <div>
          <div className="defn">
            <b>What is tracked.</b> At each point in the program the analysis records, for every qubit, whether it is definitely 0, definitely 1 or unknown. It records the same for measurement results and classical values. A program's entry point starts with every qubit at 0; other functions start with everything unknown.
          </div>
          <Figure n="10" caption={<>The lattice: the classic constant-propagation lattice, with the two qubit values in place of integers.</>}>
            <div className="plate"><div className="plate-body"><Lattice /></div></div>
          </Figure>
        </div>
        <div>
          <TableCap n={4}>Transfer functions and the rewrites they license.</TableCap>
          <div className="tablewrap">
            <table style={{ fontSize: 14.5 }}>
              <thead><tr><th>Instruction</th><th>Abstract effect</th><th>Rewrite</th></tr></thead>
              <tbody>
                <tr><td>X or Y on q</td><td>q's value flips</td><td>—</td></tr>
                <tr><td>H or another rotation on q</td><td>q becomes unknown</td><td>—</td></tr>
                <tr><td>Z, S, T or Rz on q</td><td>unchanged</td><td>delete if q is known (no visible effect)</td></tr>
                <tr><td>CX with control c, target t</td><td>c = 1: t flips; c unknown: t unknown</td><td>c = 0: delete; c = 1: becomes X on t</td></tr>
                <tr><td>CCX</td><td>as CX, needing both controls</td><td>a control is 0: delete; one is 1: becomes CX</td></tr>
                <tr><td>reset q</td><td>q becomes 0</td><td>delete if q is already 0</td></tr>
                <tr><td>measure q into r</td><td>r gets q's value</td><td>— (the measurement stays)</td></tr>
                <tr><td><code>read_result</code> r</td><td>the i1 gets r's value</td><td>replace with a constant</td></tr>
                <tr><td><code>icmp</code>, <code>zext</code>, <code>or</code> …</td><td>evaluate if inputs are known</td><td>fold to a constant</td></tr>
                <tr><td><code>br</code> on a condition</td><td>follow only the edges that can be taken</td><td>becomes an unconditional branch</td></tr>
                <tr><td>unknown call</td><td>everything becomes unknown</td><td>—</td></tr>
              </tbody>
            </table>
          </div>
          <p className="small" style={{ marginTop: 12 }}>Propagating only along edges whose condition may hold is the conditional-constant idea of Wegman and Zadeck (SCCP). After folding, <strong>unreachable-code elimination</strong> and <strong>block merging</strong> clean up the CFG. Merging matters for the quantum passes too: gates that sat in different blocks become neighbours, and the peephole pass picks them up on the next fixed-point iteration. When no branch or mid-circuit measurement remains, the module is relabelled from the Adaptive to the <strong>Base Profile</strong>, so it can run on hardware without feed-forward.</p>
        </div>
      </div>
      <Figure n="11" caption={<>The full chain on the adder of Figure 1. "Superposition" puts a in a superposition of 0–3: the sum can no longer be precomputed, but the analysis still proves the carry-out is 0 and folds the branch.</>}>
        <div style={{ marginBottom: 10 }} className="seg" role="group" aria-label="Adder input">
          <button className="btn" aria-pressed={variant === 'adder'} onClick={() => setVariant('adder')}>a = 3 (classical)</button>
          <button className="btn" aria-pressed={variant === 'adder-superposition'} onClick={() => setVariant('adder-superposition')}>a ∈ {'{0,1,2,3}'} (superposition)</button>
        </div>
        {run.ok && <Stepper run={run} codeHeight={260} />}
      </Figure>
    </Section>
  );
}

// ------------------------------------------------------------------ §8

export function Validation() {
  return (
    <Section id="validation" num="8" title="Translation validation" wide side={
      <>
        <Say>
          <p>Figure 12: click through the three cases. In each, the naive optimizer does something that looks reasonable and the checker rejects it. Then start Figure 13 and let it run while you talk. "Every one of these programs is generated, optimized and proven equivalent live, in this browser. The naive optimizer, run on the same programs, gets caught every time it is wrong."</p>
        </Say>
        <Viva q="Why validate instead of proving the optimizer correct once?">
          <p>Translation validation (Pnueli et al., 1998; Necula, 2000) checks each run of the compiler instead of the compiler itself. It is cheaper than full verification, and it catches bugs in any pass, including ones added later. We do both: the rules are machine-checked (§6), and every output is validated.</p>
        </Viva>
        <Viva q="Does exact simulation scale?">
          <p>No, and that is a known limit: simulation cost doubles with every qubit. We validate up to about 20 qubits in the browser. Beyond that the CLI reports "not checked" rather than pretending. Larger programs would need ZX-calculus or decision-diagram checkers (MQT QCEC), listed as future work.</p>
        </Viva>
      </>
    }>
      <p className="lede">Each rewrite the optimizer makes is checked by an independent oracle. The pass manager simulates the program before and after the step and rejects any difference.</p>
      <div className="defn">
        <b>Equivalence.</b> Two programs are equivalent if, started from all-zero qubits, every possible sequence of measurement results occurs with the same probability in both, and they end in the same quantum state. The checker explores every measurement branch exactly, with no sampling.
      </div>
      <Figure n="12" caption={<>Three programs where pattern matching goes wrong. The naive optimizer matches gate names and operands anywhere in a block, the classic mistake of a text-level matcher. The checker rejects each of its outputs; ours are accepted.</>}>
        <NaiveDemo />
      </Figure>
      <Figure n="13" caption={<>Property-based testing, live: random programs with deliberate redundancy, run through the full pipeline and checked for equivalence. The naive optimizer runs on the same inputs as a control.</>}>
        <Fuzzer />
      </Figure>
    </Section>
  );
}
