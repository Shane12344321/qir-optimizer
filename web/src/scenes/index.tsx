// The presentation: one idea per screen, a few big points, the real engine on screen.

import { Fragment, useMemo, useState, type ComponentType } from 'react';
import { exampleById } from '@engine/examples';
import { AblationChart } from '../components/Charts';
import { CodeView, type LineMark } from '../components/CodeView';
import { ErrorDemo } from '../components/ErrorDemo';
import { EspCurve } from '../components/EspCurve';
import { Fuzzer } from '../components/Fuzzer';
import { GateLegend } from '../components/GateLegend';
import { Icon } from '../components/Icon';
import { NaiveDemo } from '../components/NaiveDemo';
import { PipelineExplorer } from '../components/PipelineExplorer';
import { StateExplorer } from '../components/StateExplorer';
import { Stepper } from '../components/Stepper';
import { Studio } from '../components/Studio';
import { runProgram } from '../lib/run';
import { BENCH, LLVM_OK, pct, REDUCTION, ROWS, TEST_COUNT, TESTS_PASSED, VERIFIED } from '../sections/data';
import { IfAsked, Say, Scene } from './Scene';

const Q = (body: string, n = 2) => `OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[${n}];\ncreg c[${n}];\n${body}\nmeasure q -> c;\n`;

// ------------------------------------------------------------------ 1

function Title() {
  const run = useMemo(() => runProgram(exampleById('adder').source), []);
  return (
    <Scene id="s-title" n={1} className="title-scene" title={<>A self-verifying optimizer for quantum programs</>}
      points={[
        { lead: 'Compiles', rest: 'quantum programs to QIR, the industry IR built on LLVM.' },
        { lead: 'Removes', rest: 'every gate that provably does nothing.' },
        { lead: 'Proves', rest: 'each change correct before keeping it.' },
      ]}
      notes={<>
        <Say>Introduce the team and the one-line claim. Press Play on the figure: a 4-bit quantum adder computing 3 + 5 shrinks from 30 gates to 3, and every step is checked. "The rest of this talk explains how."</Say>
        <IfAsked q="How do I drive this?">→ or Space for the next screen, ← for the previous, N hides these notes. Every figure is live.</IfAsked>
      </>}>
      <p className="byline">BCSE307 Compiler Design · Review 3 · Shane · Member 2 · Member 3 · Member 4</p>
      {run.ok && <Stepper run={run} codeHeight={150} colW={34} rowH={30} showCode={false} />}
    </Scene>
  );
}

// ------------------------------------------------------------------ 2

function Noise() {
  const adder = ROWS.find((r) => r.id === 'adder')!;
  return (
    <Scene id="s-noise" n={2} title="Quantum computers make mistakes"
      points={[
        { lead: 'Every gate', rest: 'has a small chance of going wrong.' },
        { lead: 'More gates,', rest: 'lower odds of a correct answer.' },
        { lead: 'Fewer gates', rest: <>is free accuracy. The adder goes from {pct(adder.espBefore)} to {pct(adder.espAfter)} error-free.</> },
      ]}
      notes={<>
        <Say>Drag the gates slider. "With realistic error rates, a 300-gate program almost never runs cleanly. A compiler that deletes useless gates improves results without touching the hardware."</Say>
        <IfAsked q="Where do the error rates come from?">Typical published values: about 0.2% per single-qubit gate and 1.5% per two-qubit gate. It is a simulated model, not a hardware measurement.</IfAsked>
      </>}>
      <EspCurve p1={BENCH.noise.p1} p2={BENCH.noise.p2} />
    </Scene>
  );
}

// ------------------------------------------------------------------ 3

function Qubits() {
  return (
    <Scene id="s-qubit" n={3} title="A qubit in one minute"
      points={[
        { lead: '0, 1, or both:', rest: 'a qubit can be in a mixture (superposition).' },
        { lead: 'Measuring', rest: 'gives a plain 0 or 1 and ends the mixture.' },
        { lead: 'Linked qubits', rest: '(entangled) have no value of their own.' },
      ]}
      notes={<>
        <Say>Clear, then press H on q₀: 50/50. Then CX q₀→q₁: only 00 or 11 appear, so the qubits are linked. "That is all the quantum we need. Our optimizer cares about one question: is a qubit definitely 0, definitely 1, or unknown?"</Say>
        <IfAsked q="Why can't the compiler just run it to find out?">Quantum states cannot be copied, and looking at one changes it. Every fact must come from analysing the program text.</IfAsked>
      </>}>
      <StateExplorer />
    </Scene>
  );
}

// ------------------------------------------------------------------ 4

function Gates() {
  return (
    <Scene id="s-gates" n={4} title="Gates: the instructions" layout="full"
      points={[
        { lead: 'Each line', rest: 'is one qubit; time runs left to right.' },
        { lead: 'Each box or dot', rest: 'is a gate acting on those qubits.' },
        { lead: 'Most gates undo themselves:', rest: 'do one twice and nothing happens.' },
      ]}
      notes={<>
        <Say>Walk down the table: "X is NOT, H makes a 50/50 mix, CX is a controlled NOT: the dot is the control, ⊕ is the target. CCX is the same with two controls, like AND." Point at the last column: "almost everything undoes itself. That single fact is what most of our optimizations use."</Say>
        <IfAsked q="What is a phase gate for if it changes nothing visible?">On its own it doesn't, but combined with H gates it changes the outcome. Algorithms like Grover search use phase to mark the answer.</IfAsked>
      </>}>
      <GateLegend />
    </Scene>
  );
}

// ------------------------------------------------------------------ 5

function UndoGates() {
  const run = useMemo(() => runProgram(Q('h q[0];\nh q[0];\nx q[1];\nx q[1];\ncx q[0], q[1];\ncx q[0], q[1];'), { qconst: false, cfg: false }), []);
  return (
    <Scene id="s-undo" n={5} title="Some gates undo each other"
      points={[
        { lead: 'H then H', rest: 'does nothing.' },
        { lead: 'X then X,', rest: 'CX then CX: nothing.' },
        { lead: 'A compiler can delete them,', rest: 'but only when it is safe.' },
      ]}
      notes={<>
        <Say>Press Play. Three pairs vanish, and the measurement results are unchanged ("proven equivalent"). "This is what the Review 2 prototype did on text. The rest of the project is about doing it safely, on a real IR, and going much further."</Say>
      </>}>
      {run.ok && <Stepper run={run} codeHeight={220} />}
    </Scene>
  );
}

// ------------------------------------------------------------------ 5

function Qir() {
  const run = useMemo(() => runProgram(exampleById('teleport').source), []);
  const text = run.ok ? run.result.inputText : '';
  const lines = text.split('\n');
  const find = (re: RegExp) => lines.findIndex((l) => re.test(l)) + 1;
  const gate = find(/__quantum__qis__h__body/);
  const mz = find(/__quantum__qis__mz__body/);
  const rr = find(/read_result/);
  const br = find(/^\s*br i1/);
  const marks = new Map<number, LineMark>([[gate, 'hi'], [mz, 'hi'], [rr, 'hi'], [br, 'hi']]);
  return (
    <Scene id="s-qir" n={6} title="QIR: quantum programs written as LLVM IR"
      points={[
        { lead: 'The industry format,', rest: 'defined by the QIR Alliance.' },
        { lead: 'Each gate', rest: 'is a function call.' },
        { lead: 'Measurements', rest: 'feed ordinary if-branches.' },
      ]}
      notes={<>
        <Say>Point at the four highlighted lines, in order: a gate call, a measurement, reading the result into a normal i1, and branching on it. "So a QIR program is quantum code and classical code in one control-flow graph. That mix is what we exploit."</Say>
        <IfAsked q="Why QIR and not OpenQASM?">QIR sits between many languages and many machines, so one optimizer serves all of them. And because it is LLVM IR, LLVM itself can check our output.</IfAsked>
      </>}>
      <div className="plate">
        <div className="pane-h"><span>teleport.ll · generated by our front-end</span><span>{run.ok ? `${run.result.before.blocks} blocks` : ''}</span></div>
        <CodeView text={text} marks={marks} maxHeight={430} follow={false} />
        <ol className="callouts">
          <li><b>line {gate}</b> a gate is a call</li>
          <li><b>line {mz}</b> measure into a result</li>
          <li><b>line {rr}</b> read it as a normal bit</li>
          <li><b>line {br}</b> branch on it</li>
        </ol>
      </div>
    </Scene>
  );
}

// ------------------------------------------------------------------ 6

type Has = 'yes' | 'no' | 'partly';
const SEES: [string, Has, Has, Has][] = [
  ['LLVM optimizer', 'no', 'yes', 'no'],
  ['Quantum circuit tools (Qiskit, tket)', 'yes', 'partly', 'no'],
  ['This project', 'yes', 'yes', 'yes'],
];

function Gap() {
  return (
    <Scene id="s-gap" n={7} title="Nobody was optimizing both halves"
      points={[
        { lead: 'LLVM', rest: 'sees the branches but not what the gates mean.' },
        { lead: 'Quantum tools', rest: 'know the gates but barely see the branches.' },
        { lead: 'We do both,', rest: 'and prove every change.' },
      ]}
      notes={<>
        <Say>"LLVM must keep two Hadamards because they are calls it cannot understand. Qiskit knows H·H = nothing, but it never sees QIR's if-statements. Our optimizer sits exactly in the gap."</Say>
      </>}>
      <div className="plate">
        <table className="big-table">
          <thead><tr><th /><th>Understands gates</th><th>Sees branches and classical code</th><th>Proves its changes</th></tr></thead>
          <tbody>
            {SEES.map(([name, ...cells]) => (
              <tr key={name} className={name === 'This project' ? 'us' : undefined}>
                <td><strong>{name}</strong></td>
                {cells.map((c, i) => (
                  <td key={i}>
                    <span className={`mark ${c}`}>
                      {c === 'partly' ? <span className="partly">partly</span> : <Icon name={c === 'yes' ? 'check' : 'cross'} size={22} title={c} />}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Scene>
  );
}

// ------------------------------------------------------------------ 7

function Built() {
  return (
    <Scene id="s-built" n={8} title="What we built" layout="full"
      points={[
        { lead: 'Front-end:', rest: 'OpenQASM → QIR (lexer, parser, checks).' },
        { lead: 'Optimizer:', rest: 'QIR → smaller QIR.' },
        { lead: 'Verifier:', rest: 'a simulator that proves each change.' },
      ]}
      notes={<>
        <Say>Click through the stage tabs left to right: tokens, syntax tree, checked program, QIR, dependence graph, optimized QIR, output. "Every stage you see is our code, running live."</Say>
        <IfAsked q="Why not a C++ LLVM pass, as planned in Review 2?">To own every compiler phase, including the front-end, and to run the real engine in this presentation. LLVM is still used, as the checker for our output.</IfAsked>
      </>}>
      <PipelineExplorer initial="basics" />
    </Scene>
  );
}

// ------------------------------------------------------------------ 8

function Errors() {
  return (
    <Scene id="s-errors" n={9} title="The front-end catches mistakes"
      points={[
        { lead: 'Every error', rest: 'in one run.' },
        { lead: 'Exact line and column,', rest: 'with a caret.' },
        { lead: 'Suggests the fix:', rest: '"did you mean h?"' },
      ]}
      notes={<>
        <Say>"This program has five mistakes; all five are reported at once." Fix one live, for example change hadamard to h, and the list updates.</Say>
        <IfAsked q="How does it keep going after an error?">It skips to the next semicolon and resumes. A missing semicolon at a line end is reported and assumed, so the next line is still checked.</IfAsked>
      </>}>
      <ErrorDemo height={320} />
    </Scene>
  );
}

// ------------------------------------------------------------------ 9

function Wires() {
  const run = useMemo(() => runProgram(exampleById('basics').source), []);
  return (
    <Scene id="s-wires" n={10} title="Optimization 1: follow each qubit's wire"
      points={[
        { lead: 'Look along the qubit,', rest: 'not the lines of text.' },
        { lead: 'Slide gates', rest: 'past ones that cannot interfere.' },
        { lead: 'Merge rotations', rest: 'that add up to nothing.' },
      ]}
      notes={<>
        <Say>Play it. At the rotation step: "these two rotations are not next to each other, but the CNOT between them only uses this qubit as a control, which cannot interfere, so they meet and cancel."</Say>
        <IfAsked q="How do you know two gates can swap?">A fixed rule: on every shared qubit, both only change phase or both only flip. It was checked by machine on every gate pair in every position.</IfAsked>
      </>}>
      {run.ok && <Stepper run={run} codeHeight={200} />}
    </Scene>
  );
}

// ------------------------------------------------------------------ 10

function Safety() {
  const basics = useMemo(() => runProgram(exampleById('basics').source), []);
  const legacy = useMemo(() => runProgram(exampleById('legacy-qir').source), []);
  return (
    <Scene id="s-safety" n={11} title="…and never when it is unsafe" layout="full"
      points={[
        { lead: 'A measurement in between:', rest: 'keep both gates.' },
        { lead: 'Qubits that might be the same:', rest: 'keep both.' },
        { lead: 'Every refusal', rest: 'is shown and explained.' },
      ]}
      notes={<>
        <Say>Dashed brackets mark gates the optimizer refused to touch; the dotted bracket marks what blocked it. Left: a measurement sits between two H gates. Right: %q0 and %q1 are parameters, so they might be the same qubit. "Missing an optimization is fine. Breaking a program is not."</Say>
      </>}>
      <div className="two-up">
        {basics.ok && <Stepper run={basics} codeHeight={180} startAtEnd title="Measurement in between" />}
        {legacy.ok && <Stepper run={legacy} codeHeight={180} startAtEnd title="Possible aliasing" />}
      </div>
    </Scene>
  );
}

// ------------------------------------------------------------------ 11

const CHAIN = ['qubit is definitely 0', 'gate it controls never fires: deleted', 'its measurement is always 0', 'the if-condition is always false', 'that block never runs: deleted', 'simpler program, simpler hardware profile'];

function Known() {
  const [variant, setVariant] = useState<'adder' | 'adder-superposition'>('adder');
  const run = useMemo(() => runProgram(exampleById(variant).source), [variant]);
  return (
    <Scene id="s-known" n={12} title="Optimization 2: knowing a qubit's value" layout="full"
      points={[
        { lead: 'Track every qubit:', rest: '0, 1, or unknown.' },
        { lead: 'Carry that knowledge', rest: 'into the classical code.' },
        { lead: 'Delete', rest: 'whatever can never happen.' },
      ]}
      notes={<>
        <Say>Read the chain left to right, then play the adder. "Because the inputs 3 and 5 are known, the compiler works out the whole addition and the overflow check, so 30 gates become 3." Switch to superposition: "now the inputs are unknown, so most gates stay, but the overflow check is still proven impossible and removed."</Say>
        <IfAsked q="Is this sound with entangled qubits?">Yes. A qubit is only marked known when it holds that value on every run and is not linked to anything unknown. Linked qubits are always "unknown".</IfAsked>
        <IfAsked q="Which compiler technique is this?">Sparse conditional constant propagation, followed by branch folding, unreachable-block removal and block merging, as in the Dragon Book, with qubits as the constants.</IfAsked>
      </>}>
      <ol className="chain" aria-label="How one known qubit simplifies a program">
        {CHAIN.map((c, i) => (
          <Fragment key={c}>
            <li>{c}</li>
            {i < CHAIN.length - 1 && <span className="chain-arrow" aria-hidden="true"><Icon name="run" size={18} /></span>}
          </Fragment>
        ))}
      </ol>
      <div className="seg" role="group" aria-label="Adder inputs" style={{ margin: '4px 0 12px' }}>
        <button className="btn" aria-pressed={variant === 'adder'} onClick={() => setVariant('adder')}>3 + 5, inputs known</button>
        <button className="btn" aria-pressed={variant === 'adder-superposition'} onClick={() => setVariant('adder-superposition')}>inputs in superposition</button>
      </div>
      {run.ok && <Stepper run={run} codeHeight={200} colW={40} rowH={32} />}
    </Scene>
  );
}

// ------------------------------------------------------------------ 12

function Proof() {
  return (
    <Scene id="s-proof" n={13} title="Every change is proven" layout="full"
      points={[
        { lead: 'Simulate', rest: 'before and after every rewrite.' },
        { lead: 'An unsafe optimizer', rest: 'gets caught.' },
        { lead: 'Random programs:', rest: 'zero failures.' },
      ]}
      notes={<>
        <Say>Click the three cases: each time, the naive optimizer's answer differs and is rejected. Then press "Run 500 programs" and talk while it counts. "Ours: zero counterexamples. The naive one: caught hundreds of times."</Say>
        <IfAsked q="Why check every run instead of proving the optimizer once?">It is called translation validation (Pnueli 1998; Necula 2000). It is cheaper than a full proof and catches bugs in any pass, including future ones.</IfAsked>
      </>}>
      <div className="stack">
        <NaiveDemo />
        <Fuzzer />
      </div>
    </Scene>
  );
}

// ------------------------------------------------------------------ 13

const NOVEL: [string, string, string, string, string][] = [
  ['LLVM / QAT', 'QIR', 'limited', 'no', 'no'],
  ['Qiskit, tket', 'circuits', 'yes', 'partial', 'no'],
  ['RPO (CGO 2021)', 'circuits', 'yes', 'yes', 'no'],
  ['QCP (SAS 2023)', 'circuits', 'yes', 'yes, more precise', 'no'],
  ['Branch-aware QCP (2026)', 'dynamic circuits', 'yes', 'yes', 'paper proof'],
  ['This project', 'QIR, with branches', 'yes', 'yes, into classical code', 'every rewrite'],
];

function New() {
  return (
    <Scene id="s-new" n={14} title="What is new"
      points={[
        { lead: 'Not new:', rest: 'cancelling gates, tracking qubit values.' },
        { lead: 'New:', rest: 'doing it directly on QIR, and carrying it through branches and classical code.' },
        { lead: 'New:', rest: 'a proof of every single change, built in.' },
      ]}
      notes={<>
        <Say>"We are honest about prior work: the ideas exist on circuits. Our contribution is the layer, QIR with its real branches, and the built-in proof."</Say>
        <IfAsked q="Isn't QCP more powerful?">On entangled qubits, yes, it tracks more. Our contribution is integration on QIR, not a more precise analysis; plugging in a QCP-style analysis is future work.</IfAsked>
      </>}>
      <div className="plate">
        <table className="big-table compact">
          <thead><tr><th>System</th><th>Works on</th><th>Gate rules</th><th>Uses qubit values</th><th>Proves changes</th></tr></thead>
          <tbody>
            {NOVEL.map((r) => <tr key={r[0]} className={r[0] === 'This project' ? 'us' : undefined}>{r.map((c, i) => <td key={i}>{i === 0 ? <strong>{c}</strong> : c}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </Scene>
  );
}

// ------------------------------------------------------------------ 14

const SHOWCASE = ['basics', 'grover', 'adder', 'adder-7bit', 'adder-7bit-superposed', 'qft-roundtrip-4', 'random-6q-200g', 'random-dyn-10q-800g'];

function Results() {
  const adders = ROWS.filter((r) => /^adder-\dbit$/.test(r.id));
  const adderCut = adders.map((r) => 1 - r.results.full.after.gates / r.before.gates);
  return (
    <Scene id="s-results" n={15} title="Results"
      points={[
        { lead: `${pct(REDUCTION.full)} of gates removed`, rest: <>across {ROWS.length} programs, twice the Review 2 prototype ({pct(REDUCTION.adjacent)}).</> },
        { lead: `Adders shrink ${pct(Math.min(...adderCut))}–${pct(Math.max(...adderCut))}`, rest: 'once qubit values are tracked.' },
        { lead: `${LLVM_OK}/${ROWS.length} outputs accepted by LLVM;`, rest: <>{VERIFIED} proven equivalent; {TESTS_PASSED}/{TEST_COUNT} tests pass.</> },
      ]}
      notes={<>
        <Say>"Light bars: the Review 2 prototype. Middle: following wires. Dark: the full optimizer. The adders only shrink once we track qubit values, and that is the new part paying off."</Say>
        <IfAsked q="Why is the QFT round trip not fully removed?">That needs a more advanced technique (phase polynomials), which is listed as future work. We report the result as it is.</IfAsked>
      </>}>
      <div className="plate">
        <div className="plate-body"><AblationChart rows={ROWS.filter((r) => SHOWCASE.includes(r.id))} /></div>
        <div className="small muted" style={{ padding: '0 16px 12px' }}>{SHOWCASE.length} representative programs; all {ROWS.length} are in the appendix.</div>
      </div>
    </Scene>
  );
}

// ------------------------------------------------------------------ 15

function Try() {
  return (
    <Scene id="s-try" n={16} title="Try it: any program" layout="full"
      points={[
        { lead: 'Type', rest: 'any program, or add gates.' },
        { lead: 'Switch passes', rest: 'on and off.' },
        { lead: 'See the result', rest: 'on a simulated noisy machine.' },
      ]}
      notes={<>
        <Say>This is the evaluator-input stage. Ask her for a program, or try "X on q0, then CX from q0 to q1", or two H gates with a measurement between them. Tick "naive optimizer" to show a rejection.</Say>
      </>}>
      <Studio />
    </Scene>
  );
}

// ------------------------------------------------------------------ 16

function Limits() {
  return (
    <Scene id="s-limits" n={17} title="Limits and next steps" className="words-only"
      points={[
        { lead: 'Proof by simulation', rest: 'stops at about 20 qubits.' },
        { lead: 'Unknown means unknown:', rest: 'entangled qubits are not tracked.' },
        { lead: 'Noise is simulated,', rest: 'not measured on hardware.' },
        { lead: 'Next:', rest: 'smarter rotation merging, a richer qubit analysis, an LLVM plugin version, real hardware runs.' },
      ]}
      notes={<Say>Say the limits before anyone asks. Each has a concrete next step. Mention publication potential: a short workshop paper.</Say>}
    />
  );
}

// ------------------------------------------------------------------ 17

const TEAM = [
  ['Shane', 'Lead: pass manager, command line, this presentation', 'Scenes 1–7, 14, 16'],
  ['Member 2', 'Front-end: lexer, parser, checks, QIR generation', 'Scenes 8–9'],
  ['Member 3', 'Optimizer: wire rules, qubit-value analysis, branch folding', 'Scenes 10–12'],
  ['Member 4', 'Verification: simulator, equivalence checks, tests, benchmarks', 'Scenes 13, 15'],
];

function Team() {
  return (
    <Scene id="s-team" n={18} title="Who built what"
      points={[
        { lead: 'Four parts,', rest: 'one owner each.' },
        { lead: 'Each owner', rest: 'demos and defends their part.' },
        { lead: 'Questions?', rest: 'The appendix below has the full write-up.' },
      ]}
      notes={<Say>Each member presents the scenes in their row and opens their own source files if asked. Full viva answers are in the appendix at the bottom of the page.</Say>}>
      <div className="plate">
        <table className="big-table compact">
          <thead><tr><th>Member</th><th>Owns</th><th>Presents</th></tr></thead>
          <tbody>{TEAM.map((r) => <tr key={r[0]}><td><strong>{r[0]}</strong></td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
        </table>
      </div>
    </Scene>
  );
}

export interface SceneEntry {
  id: string;
  short: string;
  Component: ComponentType;
}

export const SCENES: SceneEntry[] = [
  { id: 's-title', short: 'Title', Component: Title },
  { id: 's-noise', short: 'Mistakes', Component: Noise },
  { id: 's-qubit', short: 'Qubits', Component: Qubits },
  { id: 's-gates', short: 'Gates', Component: Gates },
  { id: 's-undo', short: 'Gates undo', Component: UndoGates },
  { id: 's-qir', short: 'QIR', Component: Qir },
  { id: 's-gap', short: 'The gap', Component: Gap },
  { id: 's-built', short: 'What we built', Component: Built },
  { id: 's-errors', short: 'Front-end', Component: Errors },
  { id: 's-wires', short: 'Follow wires', Component: Wires },
  { id: 's-safety', short: 'Safety', Component: Safety },
  { id: 's-known', short: 'Known values', Component: Known },
  { id: 's-proof', short: 'Proof', Component: Proof },
  { id: 's-new', short: 'What is new', Component: New },
  { id: 's-results', short: 'Results', Component: Results },
  { id: 's-try', short: 'Try it', Component: Try },
  { id: 's-limits', short: 'Limits', Component: Limits },
  { id: 's-team', short: 'Team', Component: Team },
];
