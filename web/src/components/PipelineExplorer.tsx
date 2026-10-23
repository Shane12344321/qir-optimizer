// Every compiler stage's real output for one program, side by side with the source.

import { useMemo, useState } from 'react';
import { formatAngle, outputDistribution, type COp, type Expr, type Stmt } from '@core';
import { EXAMPLES } from '@engine/examples';
import { runProgram } from '../lib/run';
import { CodeView } from './CodeView';
import { DagView } from './DagView';
import { Circuit } from './Circuit';
import { layoutCircuit, rowKeys } from '../lib/circuit';

const STAGES = [
  { id: 'tokens', label: 'Tokens', what: 'Lexer: characters → tokens with line:column spans.' },
  { id: 'ast', label: 'AST', what: 'Recursive-descent parser: tokens → abstract syntax tree.' },
  { id: 'sema', label: 'Checked IR', what: 'Semantic analysis: symbol tables, bounds and arity checks, constant folding of angles, inline expansion of user gates.' },
  { id: 'qir', label: 'QIR', what: 'IR generation: LLVM IR in QIR Base or Adaptive Profile.' },
  { id: 'dag', label: 'Wire DAG', what: 'QIR parser + dependence analysis: one node per operation, edges along qubit wires (entry block).' },
  { id: 'opt', label: 'Optimized QIR', what: 'Pass manager at fixed point: peephole, hybrid constant propagation, CFG simplification.' },
  { id: 'out', label: 'Output', what: 'Exact simulation of both programs: measurement distributions must match.' },
] as const;

type StageId = (typeof STAGES)[number]['id'];

function exprText(e: Expr): string {
  switch (e.kind) {
    case 'num': return String(e.value);
    case 'pi': return 'π';
    case 'id': return e.name;
    case 'unary': return `−${exprText(e.arg)}`;
    case 'binary': return `(${exprText(e.left)} ${e.op} ${exprText(e.right)})`;
    case 'call': return `${e.fn}(${exprText(e.arg)})`;
  }
}

function astLines(stmts: Stmt[]): string[] {
  const out: string[] = ['Program'];
  const arg = (a: { reg: string; index?: number }) => (a.index === undefined ? a.reg : `${a.reg}[${a.index}]`);
  stmts.forEach((s, i) => {
    const last = i === stmts.length - 1;
    const p = last ? '└─ ' : '├─ ';
    const c = last ? '   ' : '│  ';
    switch (s.kind) {
      case 'version': out.push(`${p}Version ${s.version}`); break;
      case 'include': out.push(`${p}Include "${s.file}"`); break;
      case 'qreg': case 'creg': out.push(`${p}${s.kind === 'qreg' ? 'QReg' : 'CReg'} ${s.name}[${s.size}]`); break;
      case 'gatedef':
        out.push(`${p}GateDef ${s.name}(${s.params.join(', ')}) ${s.qargs.join(', ')}`);
        s.body.forEach((b, k) => out.push(`${c}${k === s.body.length - 1 ? '└─ ' : '├─ '}${b.kind === 'call' ? `Call ${b.name}${b.params.length ? `(${b.params.map(exprText).join(', ')})` : ''} ${b.args.map(arg).join(', ')}` : 'Barrier'}`));
        break;
      case 'call': out.push(`${p}Call ${s.name}${s.params.length ? `(${s.params.map(exprText).join(', ')})` : ''} ${s.args.map(arg).join(', ')}`); break;
      case 'measure': out.push(`${p}Measure ${arg(s.q)} → ${arg(s.c)}`); break;
      case 'reset': out.push(`${p}Reset ${arg(s.q)}`); break;
      case 'barrier': out.push(`${p}Barrier ${s.args.map(arg).join(', ')}`); break;
      case 'if': out.push(`${p}If ${s.creg} == ${s.value}`, `${c}└─ ${s.body.kind === 'call' ? `Call ${s.body.name} ${s.body.args.map(arg).join(', ')}` : s.body.kind}`); break;
    }
  });
  return out;
}

function opLines(ops: COp[], names: string[], cnames: string[], depth = 0): string[] {
  const pad = '  '.repeat(depth);
  return ops.flatMap((o) => {
    switch (o.kind) {
      case 'gate': return [`${pad}${o.gate}${o.params.length ? `(${o.params.map(formatAngle).join(', ')})` : ''} ${o.qubits.map((q) => names[q]).join(', ')}    ; src line ${o.src.line}`];
      case 'measure': return [`${pad}measure ${names[o.qubit]} → ${cnames[o.result]}`];
      case 'reset': return [`${pad}reset ${names[o.qubit]}`];
      case 'barrier': return [`${pad}barrier ${o.qubits.map((q) => names[q]).join(', ')}`];
      case 'opaque': return [`${pad}opaque ${o.name}`];
      case 'if': return [`${pad}if ${o.creg.name} == ${o.value}:`, ...opLines(o.body, names, cnames, depth + 1)];
    }
  });
}

/** Plain-words descriptions of the small programs, shown beside their circuits. */
export const ABOUT: Record<string, string[]> = {
  'hybrid-demo': ['Sets q0 to 1 and copies it onto q1.', 'Applies H twice to q2, which does nothing.', 'Measures q1 (always 1) and runs an if-branch only when it reads 0, which never happens.'],
  basics: ['Three pairs of gates that undo each other.', 'Two look-alike pairs that must stay: an X, or a measurement, sits between them.', 'Two rotations that cancel across a CNOT.'],
  teleport: ['Moves the state of q0 onto q2 using two measurements and two if-corrections.', 'The measurements are random, so the corrections must stay.'],
};

export function PipelineExplorer({ initial = 'teleport', only }: { initial?: string; only?: string[] }) {
  const choices = EXAMPLES.filter((e) => e.source.includes('OPENQASM') && (!only || only.includes(e.id)));
  const [exId, setExId] = useState(initial);
  const [stage, setStage] = useState<StageId>('qir');
  const ex = choices.find((e) => e.id === exId)!;
  const run = useMemo(() => runProgram(ex.source), [ex]);
  if (!run.ok || !run.compile) return <div className="diag">{run.ok ? 'not a QASM program' : run.error}</div>;
  const { compile, result } = run;
  const qn = compile.circuit.qregs.flatMap((r) => Array.from({ length: r.size }, (_, i) => `${r.name}[${i}]`));
  const cn = compile.circuit.cregs.flatMap((r) => Array.from({ length: r.size }, (_, i) => `${r.name}[${i}]`));
  const info = STAGES.find((s) => s.id === stage)!;
  const showOptimized = stage === 'opt' || stage === 'out';
  const rows = rowKeys(run.input);
  const inputCols = layoutCircuit(run.input, rows).cols;

  let body: JSX.Element;
  if (stage === 'tokens') {
    const toks = compile.tokens.filter((t) => t.kind !== 'eof');
    body = (
      <div className="codeview" style={{ maxHeight: 380, padding: '8px 14px', whiteSpace: 'normal', lineHeight: 2.1 }}>
        {toks.map((t, i) => (
          <span key={i} title={`${t.kind} @ ${t.span.line}:${t.span.col}`} style={{ border: '1px solid var(--rule)', padding: '1px 5px', marginRight: 4, display: 'inline-block', lineHeight: 1.4 }}>
            <span style={{ color: 'var(--ink-3)', fontSize: 10 }}>{t.kind === 'symbol' ? '' : `${t.kind} `}</span>{t.text}
          </span>
        ))}
        <div className="small muted" style={{ fontFamily: 'var(--serif)', marginTop: 8 }}>{toks.length} tokens. Hover a token for its kind and position.</div>
      </div>
    );
  } else if (stage === 'ast') {
    body = <CodeView text={astLines(compile.ast.stmts).join('\n')} lang="qasm" maxHeight={380} />;
  } else if (stage === 'sema') {
    body = <CodeView text={[`; ${compile.circuit.numQubits} qubits: ${qn.join(' ')}`, `; ${compile.circuit.numResults} classical bits: ${cn.join(' ')}`, ...opLines(compile.circuit.ops, qn, cn)].join('\n')} lang="qasm" maxHeight={380} />;
  } else if (stage === 'qir') {
    body = <CodeView text={result.inputText} maxHeight={380} />;
  } else if (stage === 'dag') {
    body = <div className="plate-body"><DagView module={run.input} /></div>;
  } else if (stage === 'opt') {
    body = <CodeView text={result.outputText} maxHeight={380} />;
  } else {
    const a = outputDistribution(run.input);
    const b = outputDistribution(result.module);
    const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
    body = (
      <div className="plate-body">
        <table>
          <thead><tr><th>measurement record</th><th className="num">Pr (input)</th><th className="num">Pr (optimized)</th></tr></thead>
          <tbody>{keys.map((k) => <tr key={k}><td style={{ fontFamily: 'var(--mono)' }}>{k}</td><td className="num">{((a.get(k) ?? 0) * 100).toFixed(2)}%</td><td className="num">{((b.get(k) ?? 0) * 100).toFixed(2)}%</td></tr>)}</tbody>
        </table>
        <p className="small muted" style={{ marginTop: 10 }}>Registers are printed most-significant bit first, one group per classical register ({compile.circuit.cregs.map((r) => r.name).join(', ')}).</p>
      </div>
    );
  }

  return (
    <div className="plate">
      <div className="plate-bar">
        <label className="chk" style={{ gap: 8 }}>Program
          <select className="btn" value={exId} onChange={(e) => setExId(e.target.value)}>
            {choices.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </label>
        <span className="grow" />
        <span className="seg" role="tablist" aria-label="Compiler stage">
          {STAGES.map((s) => (
            <button key={s.id} role="tab" aria-selected={stage === s.id} className="btn" aria-pressed={stage === s.id} onClick={() => setStage(s.id)}>{s.label}</button>
          ))}
        </span>
      </div>
      <div className="explorer-circuit">
        <div className="pane-h">
          <span>{showOptimized ? 'The circuit after optimization' : 'The circuit this program describes'}</span>
          <span>{showOptimized ? `${result.after.gates} gates (was ${result.before.gates})` : `${result.before.gates} gates · ${compile.circuit.numQubits} qubits`}</span>
        </div>
        <div className="plate-body" style={{ padding: '6px 16px 10px' }}>
          <div className={ABOUT[exId] ? 'with-about' : undefined}>
            <Circuit module={showOptimized ? result.module : run.input} rowOrder={rows} minCols={showOptimized ? inputCols : undefined} colW={40} rowH={34} />
            {ABOUT[exId] && (
              <div className="about">
                <h4>What this circuit does</h4>
                <ol>{ABOUT[exId].map((t) => <li key={t}>{t}</li>)}</ol>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="panes">
        <div>
          <div className="pane-h"><span>Source · OpenQASM 2.0</span><span>{ex.source.split('\n').length} lines</span></div>
          <CodeView text={ex.source} lang="qasm" maxHeight={420} />
        </div>
        <div>
          <div className="pane-h"><span>{info.label}</span><span>compiler stage {STAGES.indexOf(info) + 1} of {STAGES.length}</span></div>
          <div className="small" style={{ padding: '8px 14px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>{info.what}</div>
          {body}
        </div>
      </div>
    </div>
  );
}
