// The presentation: one idea per screen, a few big points, the real engine on screen.

import { Fragment, useMemo, useState, type ComponentType } from 'react';
import { exampleById } from '@engine/examples';
import { AblationChart } from '../components/Charts';
import { CodeView, type LineMark } from '../components/CodeView';
import { ErrorDemo } from '../components/ErrorDemo';
import { EspCurve } from '../components/EspCurve';
import { Circuit } from '../components/Circuit';
import { Fuzzer } from '../components/Fuzzer';
import { GateLegend } from '../components/GateLegend';
import { Icon } from '../components/Icon';
import { NaiveDemo } from '../components/NaiveDemo';
import { PipelineExplorer } from '../components/PipelineExplorer';
import { StateExplorer } from '../components/StateExplorer';
import { Stepper } from '../components/Stepper';
import { Studio } from '../components/Studio';
import { rowKeys } from '../lib/circuit';
import { runProgram } from '../lib/run';
import { BENCH, LLVM_OK, pct, REDUCTION, ROWS, TEST_COUNT, TESTS_PASSED, VERIFIED } from '../sections/data';
import { IfAsked, Say, Scene } from './Scene';

const Q = (body: string, n = 2) => `OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[${n}];\ncreg c[${n}];\n${body}\nmeasure q -> c;\n`;

// ------------------------------------------------------------------ 1

const DemoAbout = () => (
  <>
    <h4>What this circuit does</h4>
    <ol>
      <li>Sets q0 to 1 (X) and copies it onto q1 (CX).</li>
      <li>Applies H to q2 twice, which does nothing.</li>
      <li>Measures q1 (always 1); the if-branch runs only when it reads 0, so never.</li>
    </ol>
  </>
);


function Title() {
  const run = useMemo(() => runProgram(exampleById('hybrid-demo').source), []);
  return (
    <Scene id="s-title" n={1} className="title-scene" title={<>A self-verifying optimizer for quantum programs</>}
      points={[
        { lead: 'Compiles', rest: 'quantum programs to QIR, the industry IR built on LLVM.' },
        { lead: 'Removes', rest: 'every gate that provably does nothing.' },
        { lead: 'Proves', rest: 'each change correct before keeping it.' },
      ]}
      notes={<>
        <Say>Give the one-line claim, then press Play. A small program of 5 gates and an if-branch shrinks to 2 gates with no branch, and every step is checked. "The rest of this talk explains how."</Say>
        <IfAsked q="How do I drive this?">→ or Space for the next screen, ← for the previous, N hides these notes. Every figure is live.</IfAsked>
      </>}>
      <p className="byline">BCSE307 Compiler Design · Project Review 3</p>
      {run.ok && <Stepper run={run} showCode={false} about={<DemoAbout />} />}
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
      <PipelineExplorer initial="hybrid-demo" only={['hybrid-demo', 'basics', 'teleport']} />
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

const CHAIN = ['q0 is definitely 1', 'the CX always fires: it becomes a plain X', 'q1 is definitely 1, so its measurement is always 1', 'the if (c == 0) is always false', 'that block never runs: deleted', 'smaller program, no branches left'];

function Known() {
  const [variant, setVariant] = useState<'hybrid-demo' | 'hybrid-demo-superposition'>('hybrid-demo');
  const run = useMemo(() => runProgram(exampleById(variant).source), [variant]);
  return (
    <Scene id="s-known" n={12} title="Optimization 2: knowing a qubit's value" layout="full"
      points={[
        { lead: 'Track every qubit:', rest: '0, 1, or unknown.' },
        { lead: 'Carry that knowledge', rest: 'into the classical code.' },
        { lead: 'Delete', rest: 'whatever can never happen.' },
      ]}
      notes={<>
        <Say>Read the chain, then play. "q0 is set to 1, so the CX always fires: it becomes a plain X. Now q1 is known to be 1, so measuring it always gives 1, the if-condition is always false, and that whole block is deleted." Then switch to the superposition version: "q0 is now random, so nothing about q1 is known. The optimizer keeps the CX and the branch, and says why."</Say>
        <IfAsked q="Is this sound with entangled qubits?">Yes. A qubit is only marked known when it holds that value on every run and is not linked to anything unknown.</IfAsked>
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
      <div className="seg" role="group" aria-label="Program version" style={{ margin: '4px 0 12px' }}>
        <button className="btn" aria-pressed={variant === 'hybrid-demo'} onClick={() => setVariant('hybrid-demo')}>q0 set to 1 (known)</button>
        <button className="btn" aria-pressed={variant === 'hybrid-demo-superposition'} onClick={() => setVariant('hybrid-demo-superposition')}>q0 in superposition (unknown)</button>
      </div>
      {run.ok && (
        <Stepper run={run} codeHeight={200} about={variant === 'hybrid-demo' ? <DemoAbout /> : (
          <>
            <h4>What this circuit does</h4>
            <ol>
              <li>Puts q0 in a 50/50 mix (H) and links q1 to it (CX).</li>
              <li>Applies H to q2 twice, which does nothing.</li>
              <li>Measures q1, which is random, so the if-branch may run.</li>
            </ol>
          </>
        )} />
      )}
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


const COMPARE = [
  { key: 'llvm', title: 'LLVM optimizer', sub: 'no gate knowledge', opts: { cancel: false, commute: false, merge: false, qconst: false, cfg: false }, verdict: 'Keeps everything: gate calls are opaque to it.' },
  { key: 'circuit', title: 'Gate rules only', sub: 'what circuit optimizers do', opts: { qconst: false, cfg: false }, verdict: 'Removes the H pair, but cannot see that the branch is dead.' },
  { key: 'full', title: 'This project', sub: 'gate rules + qubit values + branches', opts: {}, verdict: 'Also turns the CX into X, proves the branch dead and deletes it.' },
] as const;

function New() {
  const src = exampleById('hybrid-demo').source;
  const runs = useMemo(() => COMPARE.map((c) => ({ ...c, run: runProgram(src, c.opts) })), [src]);
  return (
    <Scene id="s-new" n={14} title="How we are different" layout="full"
      points={[
        { lead: 'Same program,', rest: 'three kinds of optimizer.' },
        { lead: 'Others stop at the gates;', rest: 'we follow qubit values into the if-statements.' },
        { lead: 'And every change', rest: 'is proven, not assumed.' },
      ]}
      notes={<>
        <Say>"Here is the small program from the start, run through three levels of optimizer. LLVM keeps all 5 gates and all 3 blocks, because it does not know what a gate is. Gate rules alone, which is what circuit optimizers like Qiskit do, remove the two H gates but leave the branch. We remove the branch too, because we know q1 is always 1, and the result is proven identical."</Say>
        <IfAsked q="Hasn't anyone tracked qubit values before?">Yes, on circuits: RPO (CGO 2021) and QCP (SAS 2023), and a 2026 paper on branches. Ours works directly on QIR, folds real LLVM branches with the result, and proves every rewrite. The related-work table is in the appendix.</IfAsked>
      </>}>
      <div className="compare">
        {runs.map((c) => c.run.ok && (
          <div key={c.key} className={`plate${c.key === 'full' ? ' us' : ''}`}>
            <div className="pane-h"><span>{c.title}</span><span>{c.sub}</span></div>
            <div className="plate-body">
              <Circuit module={c.run.result.module} rowOrder={rowKeys(c.run.input)} colW={40} rowH={34} />
            </div>
            <div className="compare-foot">
              <span className="stats-line"><span><b>{c.run.result.after.gates}</b>gates</span><span><b>{c.run.result.after.blocks}</b>{c.run.result.after.blocks === 1 ? 'block' : 'blocks'}</span><span>{c.run.result.validation?.equivalent ? 'proven equivalent' : ''}</span></span>
              <p>{c.verdict}</p>
            </div>
          </div>
        ))}
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
  { id: 's-new', short: 'How we differ', Component: New },
  { id: 's-results', short: 'Results', Component: Results },
  { id: 's-try', short: 'Try it', Component: Try },
  { id: 's-limits', short: 'Limits', Component: Limits },
];
