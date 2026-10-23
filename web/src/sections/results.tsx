import { Fragment } from 'react';
import { Figure, Note, Say, Section, TableCap, Viva } from '../components/Bits';
import { AblationChart, CONFIGS, EspChart } from '../components/Charts';
import { Icon } from '../components/Icon';
import { Studio } from '../components/Studio';
import { BENCH, LLVM_OK, pct, REDUCTION, ROWS, SKIPPED, TESTS, TEST_COUNT, TESTS_PASSED, TOTAL, TOTAL_BEFORE, TWOQ, VERIFIED } from './data';

// ------------------------------------------------------------------ §9

type Cell = 'yes' | 'no' | 'partial' | string;
const RELATED: { name: string; cite: string; layer: string; cf: Cell; algebra: Cell; state: Cell; validate: Cell; us?: boolean }[] = [
  { name: 'LLVM opt -O3', cite: 'LLVM Project', layer: 'LLVM IR', cf: 'yes', algebra: 'no: gates are opaque calls', state: 'no', validate: 'well-formedness only' },
  { name: 'QIR Adaptor Tool (QAT)', cite: 'QIR Alliance', layer: 'QIR', cf: 'yes', algebra: 'partial: pattern-based profile adaptation', state: 'no', validate: 'profile conformance' },
  { name: 'Qiskit transpiler', cite: 'IBM', layer: 'circuit DAG', cf: 'partial', algebra: 'yes', state: 'partial', validate: 'no' },
  { name: 'Relaxed peephole optimization', cite: 'Liu, Bello, Zhou · CGO 2021', layer: 'circuit', cf: 'no', algebra: 'yes', state: 'yes: basis and pure states', validate: 'no' },
  { name: 'Quantum constant propagation', cite: 'Chen, Stade · SAS 2023', layer: 'circuit', cf: 'no: both branches kept', algebra: 'yes', state: 'yes: bounded entangled groups', validate: 'no' },
  { name: 'Branch-aware QCP', cite: 'Fulginiti, Chen · arXiv 2026', layer: 'dynamic circuit', cf: 'yes: path-sensitive', algebra: 'yes', state: 'yes', validate: 'soundness proof (paper)' },
  { name: 'Hybrid de-quantization', cite: 'Remme et al. · arXiv 2026 (MQT Core)', layer: 'MQT Core IR', cf: 'partial', algebra: 'yes', state: 'yes: hybrid state model', validate: 'not reported' },
  { name: 'QIRO', cite: 'Ittah et al. · ACM TQC 2022', layer: 'MLIR dialects', cf: 'yes', algebra: 'yes', state: 'no', validate: 'no' },
  { name: 'MQT QCEC', cite: 'Burgholzer, Wille', layer: 'circuits', cf: '—', algebra: '—', state: '—', validate: 'equivalence checking (separate tool)' },
  { name: 'This work', cite: 'Review 3', layer: 'QIR (LLVM IR), Base + Adaptive', cf: 'yes: SCCP, branch folding, block merging, profile lowering', algebra: 'yes: commutation-aware', state: 'yes: basis-state lattice', validate: 'every rewrite, exact', us: true },
];

const REFS: { text: string; url?: string }[] = [
  { text: 'A. V. Aho, M. S. Lam, R. Sethi, J. D. Ullman. Compilers: Principles, Techniques, and Tools, 2nd ed., §8.5 (DAG representation of basic blocks), §9.4 (constant propagation). Addison-Wesley, 2006.' },
  { text: 'M. N. Wegman, F. K. Zadeck. Constant propagation with conditional branches. ACM TOPLAS 13(2), 1991.' },
  { text: 'A. Pnueli, M. Siegel, E. Singerman. Translation validation. TACAS 1998, LNCS 1384.' },
  { text: 'G. C. Necula. Translation validation for an optimizing compiler. PLDI 2000.' },
  { text: 'QIR Alliance. QIR specification (Base and Adaptive Profiles).', url: 'https://github.com/qir-alliance/qir-spec' },
  { text: 'QIR Alliance. QIR Adaptor Tool (QAT).', url: 'https://www.qir-alliance.org/qat/' },
  { text: 'J. Liu, L. Bello, H. Zhou. Relaxed peephole optimization: a novel compiler optimization for quantum circuits. CGO 2021.', url: 'https://arxiv.org/abs/2012.07711' },
  { text: 'Y. Chen, Y. Stade. Quantum constant propagation. SAS 2023, LNCS 14284, pp. 164–189.' },
  { text: 'I. Fulginiti, Y. Chen. Branch-aware quantum constant propagation for dynamic quantum circuits. arXiv:2606.02018, 2026.', url: 'https://arxiv.org/abs/2606.02018' },
  { text: 'L. Remme, A. Weinert, A. Waschk, L. Burgholzer, R. Wille. Automatic de-quantization of quantum programs using constant propagation. arXiv:2605.22980, 2026.', url: 'https://arxiv.org/abs/2605.22980' },
  { text: 'D. Ittah, T. Häner, V. Kliuchnikov, T. Hoefler. QIRO: a static single assignment-based quantum program representation for optimization. ACM TQC 3(3), 2022.', url: 'https://arxiv.org/abs/2101.11030' },
  { text: 'Y. Nam, N. J. Ross, Y. Su, A. M. Childs, D. Maslov. Automated optimization of large quantum circuits with continuous parameters. npj Quantum Information 4, 2018.' },
  { text: 'S. A. Cuccaro, T. G. Draper, S. A. Kutin, D. P. Moulton. A new quantum ripple-carry addition circuit. arXiv:quant-ph/0410184, 2004.' },
  { text: 'IBM Quantum. Qiskit transpiler passes.', url: 'https://quantum.cloud.ibm.com/docs/en/api/qiskit/transpiler_passes' },
];

function Mark({ v }: { v: Cell }) {
  const head = v.split(':')[0];
  const tag = head === 'yes' ? 'ok' : head === 'no' ? 'bad' : head === 'partial' ? 'ref' : '';
  const rest = v.includes(':') ? v.slice(v.indexOf(':') + 1).trim() : '';
  if (!tag) return <span>{v}</span>;
  return <span><span className={`tag ${tag}`}>{head}</span>{rest && <span className="small muted"> {rest}</span>}</span>;
}

export function Related() {
  return (
    <Section id="related" num="9" title="Related work and what is new" wide side={
      <>
        <Say>
          <p>Lead with what is <em>not</em> new: cancellation, commutation and state-based simplification all exist. Then read the three bullets under "What is new" word for word. Point at the final table row: the only row with "yes" in every column, at the QIR layer.</p>
        </Say>
        <Viva q="Isn't QCP strictly stronger than your analysis?">
          <p>On entangled states, yes. QCP tracks bounded groups of entangled qubits, while our lattice only knows basis states. Our contribution is not a more precise lattice. It is running the analysis on QIR's real CFG and SSA, so quantum facts drive classical folding and CFG simplification and are validated per rewrite. A QCP-style domain would slot into our framework; we list it as future work.</p>
        </Viva>
        <Viva q="Why not contribute this to QAT?">
          <p>That is the natural path to adoption, and our rules are written to be portable to an LLVM pass. QAT today concentrates on adapting programs to hardware profiles rather than on semantic optimization.</p>
        </Viva>
      </>
    }>
      <p className="lede">Each ingredient has precedent. What we have not found elsewhere is their combination at the QIR layer, where quantum facts and LLVM's classical control flow meet.</p>
      <TableCap n={5}>Capabilities of related systems. "Partial" means present but restricted; see the notes beside each entry.</TableCap>
      <div className="tablewrap">
        <table>
          <thead><tr><th>System</th><th>Operates on</th><th>Classical control flow</th><th>Gate algebra</th><th>State-based simplification</th><th>Validation</th></tr></thead>
          <tbody>
            {RELATED.map((r) => (
              <tr key={r.name} className={r.us ? 'us' : undefined}>
                <td><strong>{r.name}</strong><div className="small muted">{r.cite}</div></td>
                <td>{r.layer}</td>
                <td><Mark v={r.cf} /></td>
                <td><Mark v={r.algebra} /></td>
                <td><Mark v={r.state} /></td>
                <td><Mark v={r.validate} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 40, marginTop: 28 }}>
        <div>
          <h3 style={{ marginTop: 0 }}>What is new</h3>
          <ul>
            <li><strong>Quantum constant propagation on QIR itself.</strong> It runs on LLVM's CFG and SSA rather than on a circuit, so a qubit fact becomes a constant <code>i1</code> and continues through <code>icmp</code>, <code>br</code>, unreachable-block removal, block merging and Adaptive→Base profile lowering, a chain no circuit-level tool can express.</li>
            <li><strong>Per-rewrite translation validation inside the optimizer</strong>, with a trace that explains both accepted and refused rewrites (the blocking dependence: measurement, reset, unknown call, possible alias, non-commuting gate or superposition).</li>
            <li><strong>Alias-conservative treatment of SSA qubit pointers</strong>, so the optimizer is sound on hand-written and library QIR, not only on statically addressed programs.</li>
          </ul>
        </div>
        <div>
          <h3 style={{ marginTop: 0 }}>What is not</h3>
          <ul>
            <li>Inverse cancellation, commutation and rotation merging (standard in Qiskit and tket).</li>
            <li>Basis-state simplification (RPO, CGO 2021) and quantum constant propagation (QCP, SAS 2023), whose state domain is more precise than ours.</li>
            <li>Translation validation as a technique (Pnueli, Siegel and Singerman, 1998; Necula, 2000).</li>
          </ul>
          <p className="small muted">The claim is about layer and integration, and we make it no broader than that. Our literature search was current as of October 2026.</p>
        </div>
      </div>
      <h3>References</h3>
      <ol className="refs">
        {REFS.map((r, i) => <li key={i}><span>[{i + 1}]</span><span>{r.text} {r.url && <a href={r.url} target="_blank" rel="noreferrer">{r.url.replace(/^https?:\/\//, '')}</a>}</span></li>)}
      </ol>
    </Section>
  );
}

// ------------------------------------------------------------------ §10

export function Evaluation() {
  const groups = TESTS.testResults.map((f) => ({ file: f.name.split('/').slice(-1)[0], tests: f.assertionResults }));
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const timeMed = median(ROWS.map((r) => r.results.full.timeMs));
  const big = ROWS.reduce((a, b) => (b.before.gates > a.before.gates ? b : a));
  return (
    <Section id="eval" num="10" title="Evaluation" wide side={
      <>
        <Say>
          <p>Three takeaways, in order. (1) Ablation, Figure 14: each pass layer adds reductions; the arithmetic programs only shrink once the hybrid pass runs. (2) ESP, Figure 15: fewer gates mean much higher success odds. (3) Correctness: every checkable result is proven equivalent, and the {TEST_COUNT} tests listed below all pass.</p>
        </Say>
        <Viva q="Are these real hardware numbers?">
          <p>No. ESP is computed analytically from a depolarizing model, and "simulated success" comes from noisy state-vector sampling. Both are labelled. We have no hardware access, and inventing hardware results would be dishonest.</p>
        </Viva>
        <Viva q="Why is the QFT round trip only partly removed?">
          <p>QFT followed by its inverse is the identity, but our rules see controlled-phase gates only as their CX/Rz decomposition. Cancelling them needs phase-polynomial reasoning (Nam et al., 2018), which is future work. We report the result as it is.</p>
        </Viva>
        <Note title="Reproduce">
          <p><code>npm run evidence</code> reruns the tests and benchmarks and regenerates every number in this section.</p>
        </Note>
      </>
    }>
      <p className="lede">{ROWS.length} programs: the worked examples, Cuccaro adders of 3–7 bits with classical and superposed inputs, QFT round trips, and seeded random programs of up to {big.before.gates.toLocaleString()} gates with and without feed-forward. Each was optimized under three pass configurations.</p>
      <TableCap n={6}>Summary over all {ROWS.length} benchmarks.</TableCap>
      <table style={{ maxWidth: 'var(--measure)' }}>
        <tbody>
          <tr><td>Gates removed: full pipeline · peephole only · adjacent pairs only</td><td className="num"><strong>{pct(REDUCTION.full)}</strong> · {pct(REDUCTION.peephole)} · {pct(REDUCTION.adjacent)}</td></tr>
          <tr><td>Two-qubit gates removed (full pipeline)</td><td className="num">{pct(1 - TWOQ.full / TWOQ.before)}</td></tr>
          <tr><td>Proven equivalent by exhaustive branch enumeration</td><td className="num">{VERIFIED}/{ROWS.length}{SKIPPED ? ` (${SKIPPED} exceed 4,096 branches)` : ''}</td></tr>
          <tr><td>Optimized modules accepted by the LLVM verifier</td><td className="num">{LLVM_OK}/{ROWS.length}</td></tr>
          <tr><td>Median compile time (full pipeline)</td><td className="num">{timeMed.toFixed(1)} ms</td></tr>
        </tbody>
      </table>
      <Figure n="14" caption={<>Ablation: gates remaining as a share of the input after each configuration (shorter is better). Adjacent pairs total {TOTAL.adjacent.toLocaleString()} gates, the wire DAG {TOTAL.peephole.toLocaleString()} and the hybrid pipeline {TOTAL.full.toLocaleString()}, out of {TOTAL_BEFORE.toLocaleString()}. Hover for exact counts.</>}>
        <div className="plate"><div className="plate-body"><AblationChart rows={ROWS} /></div></div>
      </Figure>
      <Figure n="15" caption={<>Estimated success probability (§1) before and after the full pipeline, under the noise model p₁ = {BENCH.noise.p1}, p₂ = {BENCH.noise.p2}, readout {BENCH.noise.readout}. Hover for the improvement factor.</>}>
        <div className="plate"><div className="plate-body"><EspChart rows={ROWS} /></div></div>
      </Figure>
      <h3>All results</h3>
      <TableCap n={7}>Per-benchmark results under the three configurations of Figure 14.</TableCap>
      <div className="tablewrap">
        <table style={{ fontSize: 14 }}>
          <thead>
            <tr>
              <th>Benchmark</th><th className="num">Qubits</th><th className="num">Gates</th>
              {CONFIGS.map((c) => <th key={c.key} className="num">{c.key === 'adjacent-only' ? 'Adjacent' : c.key === 'peephole' ? 'Peephole' : 'Full'}</th>)}
              <th className="num">2-qubit</th><th className="num">Blocks</th><th>Equiv.</th><th className="num">ESP</th><th className="num">Simulated success</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => {
              const f = r.results.full.after;
              return (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{r.id}</td>
                  <td className="num">{r.qubits}</td>
                  <td className="num">{r.before.gates}</td>
                  {CONFIGS.map((c) => <td key={c.key} className="num" style={{ fontWeight: c.key === 'full' ? 700 : undefined }}>{r.results[c.key].after.gates}</td>)}
                  <td className="num">{r.before.twoQubit} → {f.twoQubit}</td>
                  <td className="num">{r.before.blocks} → {f.blocks}</td>
                  <td>{r.equivalent === true ? <span className="tag ok">proven</span> : r.equivalent === false ? <span className="tag bad">failed</span> : <span className="tag">not checked</span>}</td>
                  <td className="num">{pct(r.espBefore, 1)} → {pct(r.espAfter, 1)}</td>
                  <td className="num">{r.metric === 'hellinger' ? `${pct(r.successBefore!, 1)} → ${pct(r.successAfter!, 1)}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>Simulated success is the Hellinger fidelity of 4,000 noisy shots against the exact ideal distribution: the probability of the correct answer for deterministic programs, with ±0.5 percentage points of sampling error. It is shown only where the output has few enough outcomes to estimate. "Not checked" means more than 4,096 measurement branches. Benchmarks run on {new Date(BENCH.generated).toUTCString().slice(0, 16)}.</p>
      <h3>Test suite · {TESTS_PASSED}/{TEST_COUNT} passing</h3>
      <div style={{ columns: '2 360px', columnGap: 40, fontSize: 14.5, lineHeight: 1.45 }}>
        {groups.map((g) => (
          <Fragment key={g.file}>
            <h4 style={{ breakAfter: 'avoid' }}><code>{g.file}</code></h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {g.tests.map((t, i) => (
                <li key={i} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 6, breakInside: 'avoid' }}>
                  <span style={{ color: t.status === 'passed' ? 'var(--ok)' : t.status === 'skipped' ? 'var(--ink-3)' : 'var(--bad)', paddingTop: 3 }}><Icon name={t.status === 'passed' ? 'check' : 'cross'} size={13} title={t.status} /></span>
                  <span>{[...t.ancestorTitles.slice(-1), t.title].join(' › ')}</span>
                </li>
              ))}
            </ul>
          </Fragment>
        ))}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ §11

export function Lab() {
  return (
    <Section id="lab" num="11" title="Laboratory: bring your own program" wide side={
      <>
        <Say>
          <p>This is the evaluator-selected-input stage. Invite her to dictate a program, or use "Add" to append gates. Good prompts: "H twice on the same qubit, then measure", "X on q0, then CX from q0 to q1", or any program with an <code>if</code>. Toggle a pass off to show what it contributes. Tick "naive optimizer" to show a rejection.</p>
        </Say>
        <Note title="Accepted input">
          <p>OpenQASM 2.0 with <code>qelib1.inc</code>, user gates and <code>if</code>; or raw QIR in either pointer style. Programs of up to about 20 qubits are simulated and verified.</p>
        </Note>
      </>
    }>
      <p className="lede">Everything above, on any program. Edit the source, toggle passes, replay the rewrites, compare outcome distributions, and set the noise level.</p>
      <Figure n="16" caption={<>The optimizer laboratory. Ideal columns are exact; noisy columns are 1,500 simulated shots under the chosen error rate.</>}>
        <Studio />
      </Figure>
    </Section>
  );
}

// ------------------------------------------------------------------ §12

export function Limits() {
  return (
    <Section id="limits" num="12" title="Limitations and future work" side={
      <>
        <Say>
          <p>Volunteer the limits before you are asked. Each one is a boundary we chose and measured, and each has a concrete next step.</p>
        </Say>
        <Viva q="What would you do with three more months?">
          <p>Phase-polynomial rotation merging for the QFT-style cases, a QCP-style entangled-state domain plugged into the same lattice framework, and an LLVM new-pass-manager plugin that reuses the rules so the work can be upstreamed to QAT.</p>
        </Viva>
      </>
    }>
      <h3 style={{ marginTop: 0 }}>Limitations</h3>
      <ul>
        <li><strong>Local rewriting.</strong> Peephole rules act within a basic block. Cross-block opportunities appear only after blocks are merged.</li>
        <li><strong>Coarse quantum domain.</strong> The analysis only knows "definitely 0" and "definitely 1". Superposed and entangled qubits count as unknown, so a QCP-style analysis would find more.</li>
        <li><strong>No phase-polynomial reasoning.</strong> QFT·QFT<sup>−1</sup> is only partly cancelled (Table, §10).</li>
        <li><strong>Validation scales exponentially.</strong> Exact simulation stops around 20 qubits; beyond that, results are reported as unchecked.</li>
        <li><strong>No hardware mapping.</strong> Qubit routing, native-gate synthesis and scheduling are out of scope. Our output feeds those stages.</li>
        <li><strong>Ideal semantics.</strong> As in classical compilers, folding assumes fault-free execution. Deliberate fault checks must be opaque to the optimizer.</li>
        <li><strong>Simulated noise.</strong> All success figures come from a depolarizing model, not from a device.</li>
      </ul>
      <h3>Future work</h3>
      <ul>
        <li>Phase-polynomial rotation merging (Nam et al., 2018) for CX–R<sub>z</sub> networks.</li>
        <li>A bounded entangled-state domain (QCP) and branch-aware refinement (BQCP) inside the same SCCP framework.</li>
        <li>Decision-diagram or ZX-calculus equivalence checking for validation beyond 20 qubits.</li>
        <li>An LLVM pass-plugin front for the same rules, for integration with QAT.</li>
        <li>Runs on real hardware through a QIR-accepting provider, to replace ESP with measured success.</li>
      </ul>
      <h3>Publication potential</h3>
      <p>The integration of quantum constant propagation with QIR's classical control flow, plus built-in translation validation, is a credible short paper for a workshop on programming languages or software for quantum computing. The ablation and validation results above are its evaluation section.</p>
    </Section>
  );
}

// ------------------------------------------------------------------ §13


const DEMO = [
  ['1. Environment', 'Terminal: npm ci && npm test → qiropt --version', '§10 test list'],
  ['2. Normal case', 'Figure 1 (adder) or qiropt opt example:adder', '§0'],
  ['3. Boundary case', 'Figure 8: H X X H cascade; rotation merge to 0; legacy typed-pointer QIR', '§6'],
  ['4. Failure case', 'Figure 6 diagnostics; Figure 12 naive optimizer rejected', '§5, §8'],
  ['5. Internal evidence', 'Figure 5 stage tabs (tokens, AST, QIR, DAG); trace with --trace trace.json', '§4'],
  ['6. Evaluation', 'Figures 14–15, results table, live Figure 13', '§8, §10'],
  ['7. Evaluator input', 'Figure 16 laboratory', '§11'],
];

const VIVA: [string, string][] = [
  ['What is the time complexity of the peephole pass?', 'For each gate, the partner search walks forward along its wires and stops at the first blocking instruction. That is O(n·k) per sweep, with k the distance to a blocker (small in practice), and the fixed-point loop repeats until nothing changes. Measured on this suite: a median of about a millisecond, and 15–40 ms for the ~1,000-gate random programs.'],
  ['Why a fixed point and not one pass?', 'Rewrites enable each other. Cancelling X·X turns H X X H into H H; folding a branch merges blocks and creates new neighbours. Iterating until no pass changes anything is the standard way to compose such passes.'],
  ['How do you know the QIR you emit is valid?', 'tests/llvm.test.ts feeds every example and 40 random optimized programs to LLVM (clang -x ir or llvm-as), which parses and verifies them. A deliberately broken module is also checked to make sure the test fails.'],
  ['What happens with gates you do not know?', 'They stay opaque calls, treated as touching every qubit, so nothing moves across them. The optimizer is conservative by construction.'],
  ['Why may S·T be folded into one Rz(3π/4)?', 'Diagonal single-qubit gates are all Rz rotations up to a global phase, so any run of them on one wire folds into one. We emit a named gate when one exists (T·T = S, S·S = Z), otherwise Rz. Phase differences of the whole state are unobservable, so this is safe.'],
  ['Could the analysis wrongly fold a branch?', 'Only if a qubit marked "definitely 0" or "definitely 1" could hold anything else, and every rule in Table 4 is written so that it cannot. The equivalence checker also validates every branch fold. The property tests include thousands of programs with feed-forward.'],
  ['Why does the adder disappear?', 'Its inputs are compile-time constants, so the whole reversible computation is a constant. It is partial evaluation, the same thing a classical compiler does to a pure function of constants. With superposed inputs (Figure 11) most of the circuit stays.'],
  ['Why did you abandon the Review 2 plan of a C++ pass?', 'To own every phase, including the front-end, and to make the demo run the real engine. LLVM is still used, as the validator. The rules are portable to an LLVM pass (future work).'],
];

export function Team() {
  return (
    <Section id="team" num="13" title="Demonstration and viva" wide side={
      <>
        <Say>
          <p>Run the demonstration in the order of the table: it is the Review 3 guideline's seven-stage sequence.</p>
        </Say>
        <Note title="Before the review">
          <ul>
            <li>Run <code>npm run evidence</code> on the demo laptop.</li>
            <li>Rehearse with presenter notes off (<kbd>N</kbd>).</li>
          </ul>
        </Note>
      </>
    }>
      <h3 style={{ marginTop: 0 }}>Demonstration sequence</h3>
      <TableCap n={8}>The Review 3 guideline's seven demonstration stages mapped to this walkthrough.</TableCap>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Stage (Review 3 §8)</th><th>What to show</th><th>Where</th></tr></thead>
          <tbody>{DEMO.map((r) => <tr key={r[0]}><td><strong>{r[0]}</strong></td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
        </table>
      </div>
      <h3>Prepared viva answers</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '6px 40px' }}>
        {VIVA.map(([q, a]) => (
          <div key={q} className="note viva" style={{ borderTopColor: 'var(--rule)' }}>
            <p style={{ margin: '0 0 4px' }}><strong>{q}</strong></p>
            <p className="small">{a}</p>
          </div>
        ))}
      </div>
      <h3>Reproduce everything</h3>
      <pre className="codeview" style={{ padding: '12px 14px', border: '1px solid var(--rule)', whiteSpace: 'pre-wrap' }}>{`npm ci
npm test                                   # ${TEST_COUNT} tests: rules, property tests, LLVM verification
npx tsx src/cli/main.ts opt example:adder  # optimization report with every rewrite explained
npx tsx src/cli/main.ts verify a.ll b.ll   # equivalence check of any two programs
npm run bench                              # ablation study → bench/results.md
npm run dev                                # this walkthrough at http://localhost:5188`}</pre>
    </Section>
  );
}
