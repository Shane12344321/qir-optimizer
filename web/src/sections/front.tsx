import { useMemo } from 'react';
import { exampleById } from '@engine/examples';
import { CodeView } from '../components/CodeView';
import { EspCurve } from '../components/EspCurve';
import { Figure, Note, Say, Section, TableCap, Viva } from '../components/Bits';
import { StateExplorer } from '../components/StateExplorer';
import { Stepper } from '../components/Stepper';
import { runProgram } from '../lib/run';
import { BENCH, pct, REDUCTION, ROWS, TEST_COUNT, TESTS_PASSED, TOTAL_BEFORE, VERIFIED } from './data';

// ------------------------------------------------------------------ §0

export function Abstract() {
  const run = useMemo(() => runProgram(exampleById('adder').source), []);
  return (
    <section className="section wide" id="abstract" data-section aria-labelledby="title">
      <div className="col">
        <h1 id="title">A Hybrid-Aware, Self-Verifying Optimizer for the Quantum Intermediate Representation</h1>
        <div className="authors">
          <span>Shane<small>Member 1 · lead, integration</small></span>
          <span>Member 2<small>front-end</small></span>
          <span>Member 3<small>optimizer</small></span>
          <span>Member 4<small>verification</small></span>
        </div>
        <div className="affil">BCSE307 Compiler Design · Project Review 3 · Evaluator: Dr Shalini</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.82fr) minmax(0, 1.18fr)', gap: 44, alignItems: 'start' }} className="abs-grid">
          <div>
            <div className="abstract">
              <h4>Abstract</h4>
              <p>
                In QIR every gate is an opaque LLVM call: LLVM cannot simplify it, and circuit optimizers cannot see QIR's classical control flow. We present a QIR-to-QIR optimizer that reasons across both. Peephole rewriting follows qubit wires and commutation. A sparse conditional dataflow analysis tracks qubit basis states, measurement results and SSA values in one lattice, so a qubit proven to be in a basis state becomes a constant measurement, a folded branch and a deleted block. Every rewrite is translation-validated by an exact simulator.
              </p>
              <p>
                On {ROWS.length} programs the pipeline removes <strong>{pct(REDUCTION.full)}</strong> of {TOTAL_BEFORE.toLocaleString()} gates (adjacent-pair cancellation: {pct(REDUCTION.adjacent)}). Every checkable result is proven equivalent, and every output passes the LLVM verifier.
              </p>
            </div>
            <h4>Contributions</h4>
            <ol className="contrib">
              <li><span>A complete compiler for the problem: an OpenQASM 2.0 front-end (lexer, recursive-descent parser with error recovery, semantic analysis) that emits spec-conformant QIR, and a QIR reader for arbitrary producers, including legacy typed-pointer modules.</span></li>
              <li><span>Commutation-aware peephole optimization along qubit wires. SSA qubits are treated conservatively for aliasing, and every algebraic rule is checked for soundness exhaustively on three qubits (§6).</span></li>
              <li><span>Hybrid quantum–classical constant propagation over QIR's control-flow graph. It folds measurements, comparisons and branches, removes unreachable blocks, merges blocks and lowers programs from the Adaptive to the Base Profile (§7).</span></li>
              <li><span>Translation validation and an explanation trace. Every rewrite is checked by simulation, and every refused rewrite records the dependence that blocked it (§8).</span></li>
            </ol>
          </div>
          <Figure n="1" caption={<>The Cuccaro ripple-carry adder computing 3 + 5, with a classical overflow check. Press Play: the optimizer proves every qubit's value at compile time, folds the overflow branch and leaves three X gates that write 8 into the sum register. Every step is validated.</>}>
            {run.ok && <Stepper run={run} codeHeight={160} colW={34} rowH={30} />}
          </Figure>
        </div>
      </div>
      <aside className="side">
        <Say>
          <p>Open on Figure 1 and press Play. Say: "This is a 4-bit quantum adder with a classical overflow check. Watch the compiler prove each qubit's value, fold the branch on the overflow bit and delete that block. 30 gates and 3 basic blocks become 3 gates and 1 block, and each step is checked by the simulator."</p>
          <p>Then read C1–C4 aloud. They are the four claims the rest of the walkthrough proves, in order.</p>
        </Say>
        <Viva q="Isn't this just constant folding?">
          <p>It is constant propagation, but the constants are quantum states, and the facts cross from the quantum part of the IR into the classical part (measurement → i1 → icmp → br). Neither LLVM nor a circuit optimizer can make that crossing. §9 compares it with the closest research.</p>
        </Viva>
        <Note title="Evidence on this page">
          <p>{TESTS_PASSED}/{TEST_COUNT} automated tests passing · {ROWS.length} benchmarks ({VERIFIED} proven equivalent) · benchmark run of {new Date(BENCH.generated).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.</p>
        </Note>
      </aside>
    </section>
  );
}

// ------------------------------------------------------------------ §1

export function Problem() {
  const p1 = BENCH.noise.p1, p2 = BENCH.noise.p2;
  const adder = ROWS.find((r) => r.id === 'adder')!;
  return (
    <Section id="problem" num="1" title="Every gate costs accuracy" side={
      <>
        <Say>
          <p>Drag the slider. The point: on today's machines, a program's chance of an error-free run decays exponentially in its gate count. A compiler that removes gates directly raises the success rate, which makes it the cheapest error mitigation available.</p>
        </Say>
        <Viva q="Where do the error rates come from?">
          <p>They are representative of published superconducting-device calibrations: about 10⁻³ per single-qubit gate and 10⁻² per two-qubit gate. The model is a simulation, not a measurement on hardware, and we say so wherever it is used.</p>
        </Viva>
      </>
    }>
      <p className="lede">Quantum hardware is noisy. Each gate has a small chance of going wrong, so the longer a program is, the less likely it is to finish without an error.</p>
      <p>Typical error rates are about {pct(p1, 1)} per single-qubit gate and {pct(p2, 1)} per two-qubit gate. Multiply the chances of every gate succeeding and you get the program's <em>estimated success probability</em> (ESP): the chance of a run with no error at all. Removing gates raises it directly, with no change to the hardware. The adder of Figure 1 goes from an ESP of {pct(adder.espBefore, 1)} to {pct(adder.espAfter, 1)}.</p>
      <Figure n="2" caption={<>ESP against program length under the §10 noise model. Drag to change the length and the share of two-qubit gates.</>}>
        <EspCurve p1={p1} p2={p2} />
      </Figure>
      <h3>Why existing compilers leave the gates in</h3>
      <p>To LLVM, the two Hadamards below are calls to an external function with unknown side effects. Its optimizer must keep both: it cannot know that two Hadamards in a row undo each other. Circuit optimizers such as Qiskit's transpiler do know the algebra, but they work on a circuit data structure and never see QIR's basic blocks, branches or SSA values. The gap is a QIR-level optimizer that understands gate semantics and classical control flow together.</p>
      <CodeView text={`call void @__quantum__qis__h__body(ptr null)   ; opaque call: LLVM must keep it\ncall void @__quantum__qis__h__body(ptr null)   ; and this one`} maxHeight={80} />
    </Section>
  );
}

// ------------------------------------------------------------------ §2

export function Quantum() {
  return (
    <Section id="quantum" num="2" title="The quantum basics this project needs" side={
      <>
        <Say>
          <p>Keep this to two minutes. In Figure 3, press H on q₀ and show the 50/50 split, then CX 0→1 and show that the two qubits are now linked. Then read the four compiler consequences at the bottom: everything later builds on them.</p>
        </Say>
        <Viva q="Why can't the compiler just copy a qubit to look at it?">
          <p>Quantum states cannot be copied (the no-cloning theorem), and looking at one changes it. So the compiler can never test a value at compile time; every fact it uses comes from static analysis of the program text.</p>
        </Viva>
      </>
    }>
      <p className="lede">Only four ideas are needed to follow the rest of this walkthrough.</p>
      <div className="defn">
        <b>Qubit.</b> Like a bit, it can be 0 or 1. Unlike a bit, it can also be in a mixture of both (a <em>superposition</em>) until it is measured.
      </div>
      <div className="defn">
        <b>Gate.</b> An instruction that changes one, two or three qubits: X flips a qubit, H puts it into an even 0/1 mixture, CX flips one qubit if another is 1. Many gates undo themselves, so applying the same one twice does nothing. That is what most of our optimizations exploit.
      </div>
      <div className="defn">
        <b>Measurement.</b> Reading a qubit gives a plain 0 or 1, with probabilities set by its state, and destroys the mixture. The result is an ordinary bit that the program can branch on.
      </div>
      <div className="defn">
        <b>Entanglement.</b> After some two-qubit gates, qubits are linked: neither has a value of its own, only the pair does. The optimizer has to treat such qubits as unknown.
      </div>
      <Figure n="3" caption={<>Two qubits, simulated live by the same code that checks the optimizer. Apply gates and watch the probability of each outcome.</>}>
        <StateExplorer />
      </Figure>
      <h3>What this means for a compiler</h3>
      <ol>
        <li><strong>Gates are side effects on shared state.</strong> Two operations on the same qubit must keep their order unless they provably commute, exactly like two stores to the same address. §6 builds a dependence graph in which the addresses are qubits.</li>
        <li><strong>No copies, no peeking.</strong> Quantum values cannot be duplicated or evaluated at compile time. Every fact must come from static analysis.</li>
        <li><strong>Measurement is I/O.</strong> It is observable and irreversible, so nothing may be moved or merged across it.</li>
        <li><strong>Correctness means identical outcomes.</strong> An optimized program is correct if every measurement result occurs with the same probability as before. §8 checks exactly that.</li>
      </ol>
    </Section>
  );
}

// ------------------------------------------------------------------ §3

export function Qir() {
  const run = useMemo(() => runProgram(exampleById('teleport').source), []);
  return (
    <Section id="qir" num="3" title="QIR: quantum programs as LLVM IR" side={
      <>
        <Say>
          <p>Scroll the listing and point out four things: <code>ptr</code> qubit addresses, the <code>__quantum__qis__*</code> gate calls, <code>mz</code> writing a result, and the <code>read_result</code> → <code>br</code> pair. That pair is the hybrid control flow everything in §7 exploits.</p>
        </Say>
        <Viva q="Why QIR and not OpenQASM as the IR?">
          <p>QIR is the shared interface between front-ends (Q#, CUDA-Q, OpenQASM via our compiler) and hardware back-ends, so an optimizer at this layer serves all of them. It is also LLVM IR, so we can validate our output with LLVM's own verifier.</p>
        </Viva>
        <Note title="References">
          <p className="cite">QIR Alliance, <a href="https://github.com/qir-alliance/qir-spec" target="_blank" rel="noreferrer">QIR specification</a>: Base and Adaptive Profiles, opaque-pointer (QIR 2) conventions.</p>
        </Note>
      </>
    }>
      <p className="lede">The Quantum Intermediate Representation, specified by the QIR Alliance, is ordinary LLVM IR with a convention: qubits and measurement results are pointers, and gates are calls to <code>__quantum__qis__*</code> functions.</p>
      <p>Our front-end emits QIR with opaque pointers and static addressing. Qubit k is the constant <code>inttoptr (i64 k to ptr)</code>, so qubit identity is decidable by comparing constants. <em>Profiles</em> restrict what a program may do. The <strong>Base Profile</strong> is a single straight-line block with all measurements at the end. The <strong>Adaptive Profile</strong> allows mid-circuit measurement, <code>read_result</code> and conditional branches, so a QIR program has a real control-flow graph whose edges depend on quantum outcomes.</p>
      <Figure n="4" caption={<>Quantum teleportation compiled by our front-end: two mid-circuit measurements, each read back into an <code>i1</code> and branched on (Adaptive Profile). The listing is the exact text our generator emits; <code>clang -x ir</code> accepts it.</>}>
        <div className="plate">
          <div className="pane-h"><span>teleport.ll</span><span>{run.ok ? `${run.result.before.blocks} basic blocks · ${run.result.before.gates} gates` : ''}</span></div>
          {run.ok && <CodeView text={run.result.inputText} maxHeight={420} />}
        </div>
      </Figure>
      <TableCap n={1}>How each QIR construct is treated by the optimizer.</TableCap>
      <table>
        <thead><tr><th>QIR construct</th><th>Meaning</th><th>Treated by the optimizer as</th></tr></thead>
        <tbody>
          <tr><td><code>call @__quantum__qis__h__body(ptr q)</code></td><td>apply a gate</td><td>a node in the wire DAG with known algebra</td></tr>
          <tr><td><code>call @__quantum__qis__mz__body(ptr q, ptr r)</code></td><td>measure q into result r</td><td>a barrier on q; defines r in the lattice</td></tr>
          <tr><td><code>%v = call i1 @__quantum__rt__read_result(ptr r)</code></td><td>bring a result into classical SSA</td><td>the quantum → classical edge of the analysis</td></tr>
          <tr><td><code>br i1 %c, label %a, label %b</code></td><td>feed-forward</td><td>a CFG edge; folded when <code>%c</code> is constant</td></tr>
          <tr><td>any other call</td><td>unknown runtime or vendor code</td><td>a barrier on every qubit (sound by default)</td></tr>
        </tbody>
      </table>
    </Section>
  );
}
