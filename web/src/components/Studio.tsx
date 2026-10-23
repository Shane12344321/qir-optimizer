// Free-play laboratory: any OpenQASM or QIR program, any pass configuration,
// replayed step by step, verified, and run on a simulated noisy device.

import { useEffect, useMemo, useState } from 'react';
import { checkEquivalence, DEFAULT_NOISE, naiveOptimize, outputDistribution, sampleShots, type NoiseModel, type OptimizeOptions, SimulationError } from '@core';
import { EXAMPLES } from '@engine/examples';
import { runProgram, type RunOk } from '../lib/run';
import { Stepper } from './Stepper';

const PASSES = [
  ['cancel', 'Inverse cancellation'],
  ['commute', 'Commutation'],
  ['merge', 'Rotation / phase merging'],
  ['qconst', 'Hybrid constant propagation'],
  ['cfg', 'CFG simplification'],
] as const;

const PALETTE = ['h', 'x', 'y', 'z', 's', 't', 'rx(pi/4)', 'rz(pi/4)', 'cx', 'cz', 'swap', 'ccx', 'measure', 'reset'];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Studio() {
  const [exId, setExId] = useState('basics');
  const [source, setSource] = useState(EXAMPLES[0].source);
  const [opts, setOpts] = useState<Record<string, boolean>>({ cancel: true, commute: true, merge: true, qconst: true, cfg: true });
  const [naive, setNaive] = useState(false);
  const [p2, setP2] = useState(DEFAULT_NOISE.p2);
  const [pal, setPal] = useState({ gate: 'h', a: 0, b: 1, c: 2 });
  const src = useDebounced(source, 350);

  const options: OptimizeOptions = useMemo(() => ({ ...opts }), [opts]);
  const run = useMemo(() => runProgram(src, options), [src, options]);
  const naiveRun = useMemo(() => {
    if (!naive || !run.ok) return undefined;
    const { module } = naiveOptimize(run.input);
    return { module, v: checkEquivalence(run.input, module) };
  }, [naive, run]);

  const pick = (id: string) => {
    setExId(id);
    setSource(EXAMPLES.find((e) => e.id === id)!.source);
  };

  const append = () => {
    const q = (i: number) => `q[${i}]`;
    const one = pal.gate === 'measure' ? `measure ${q(pal.a)} -> c[${pal.a}];` : pal.gate === 'reset' ? `reset ${q(pal.a)};` : null;
    const arity = ['cx', 'cz', 'swap'].includes(pal.gate) ? 2 : pal.gate === 'ccx' ? 3 : 1;
    const line = one ?? `${pal.gate} ${[pal.a, pal.b, pal.c].slice(0, arity).map(q).join(', ')};`;
    setSource((s) => (/qreg\s+q\[/.test(s) ? `${s.replace(/\s*$/, '')}\n${line}\n` : `OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\ncreg c[3];\n${line}\n`));
    setExId('custom');
  };

  return (
    <div className="plate">
      <div className="plate-bar">
        <label className="chk" style={{ gap: 8 }}>Start from
          <select className="btn" value={exId} onChange={(e) => pick(e.target.value)}>
            {EXAMPLES.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            {exId === 'custom' && <option value="custom">Your program</option>}
          </select>
        </label>
        <button className="btn" onClick={() => { setSource('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\ncreg c[3];\n'); setExId('custom'); }}>Empty program</button>
        <span className="grow" />
        {PASSES.map(([k, label]) => (
          <label key={k} className="chk"><input type="checkbox" checked={opts[k]} onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.checked }))} />{label}</label>
        ))}
      </div>
      <div className="panes" style={{ gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.4fr)' }}>
        <div>
          <div className="pane-h"><span>Program · OpenQASM 2.0 or QIR</span><span>edit freely</span></div>
          <textarea className="editor" wrap="off" spellCheck={false} value={source} onChange={(e) => { setSource(e.target.value); setExId('custom'); }} aria-label="Program source" />
          <div className="plate-bar" style={{ borderTop: '1px solid var(--rule)', borderBottom: 0 }}>
            <strong>Add</strong>
            <select className="btn" value={pal.gate} onChange={(e) => setPal((p) => ({ ...p, gate: e.target.value }))} aria-label="Gate">
              {PALETTE.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            {(['a', 'b', 'c'] as const).map((k, i) => (
              <label key={k} className="chk">{i === 0 ? 'on q' : 'q'}
                <input type="number" min={0} max={9} value={pal[k]} onChange={(e) => setPal((p) => ({ ...p, [k]: Math.max(0, Math.min(9, Number(e.target.value))) }))} style={{ width: 44 }} className="btn" />
              </label>
            ))}
            <button className="btn primary" onClick={append}>Append</button>
          </div>
          {run.ok && run.warnings && <pre className="diag warn">{run.warnings}</pre>}
          {!run.ok && <pre className="diag" role="alert">{run.error}</pre>}
        </div>
        <div>
          {run.ok ? <Results run={run} naiveRun={naiveRun} naive={naive} setNaive={setNaive} p2={p2} setP2={setP2} /> : (
            <div className="plate-body muted">The program has errors; the compiler's diagnostics are shown under the editor. Fix them and the optimizer reruns automatically.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Results({ run, naiveRun, naive, setNaive, p2, setP2 }: {
  run: RunOk; naiveRun?: { module: RunOk['input']; v: ReturnType<typeof checkEquivalence> }; naive: boolean; setNaive: (b: boolean) => void; p2: number; setP2: (n: number) => void;
}) {
  const noise: NoiseModel = { p1: p2 / 7.5, p2, readout: DEFAULT_NOISE.readout };
  const sim = useMemo(() => {
    try {
      const target = naiveRun?.module ?? run.result.module;
      const ideal = outputDistribution(run.input);
      const after = outputDistribution(target);
      const shots = 1500;
      const hb = sampleShots(run.input, shots, { seed: 11, noise });
      const ha = sampleShots(target, shots, { seed: 11, noise });
      const top = [...ideal].sort((a, b) => b[1] - a[1])[0];
      const deterministic = top && top[1] > 0.999;
      return { ideal, after, hb, ha, shots, top, deterministic };
    } catch (e) {
      if (e instanceof SimulationError) return { error: e.message };
      throw e;
    }
  }, [run, naiveRun, p2]);

  return (
    <div>
      <div className="plate-bar">
        <label className="chk"><input type="checkbox" checked={naive} onChange={(e) => setNaive(e.target.checked)} />Use the naive optimizer instead (unsafe)</label>
        <span className="grow" />
        {naiveRun && <span className={`tag ${naiveRun.v.equivalent ? 'ok' : 'bad'}`}>{naiveRun.v.equivalent ? 'naive result happens to be equivalent' : `naive result rejected: ${naiveRun.v.detail}`}</span>}
      </div>
      <div style={{ borderBottom: '1px solid var(--rule)' }}>
        <Stepper run={run} codeHeight={240} title={naive ? 'Safe optimizer (for comparison)' : undefined} />
      </div>
      <div className="plate-body">
        {'error' in sim ? <p className="muted small">{sim.error}</p> : (
          <>
            <h4 style={{ marginTop: 0 }}>Measurement outcomes</h4>
            <div className="tablewrap">
              <table>
                <thead><tr><th>outcome</th><th className="num">ideal · input</th><th className="num">ideal · {naive ? 'naive' : 'optimized'}</th><th className="num">noisy · input</th><th className="num">noisy · {naive ? 'naive' : 'optimized'}</th></tr></thead>
                <tbody>
                  {[...new Set([...sim.ideal.keys(), ...sim.after.keys()])].sort((a, b) => (sim.ideal.get(b) ?? 0) - (sim.ideal.get(a) ?? 0)).slice(0, 8).map((k) => {
                    const bad = Math.abs((sim.after.get(k) ?? 0) - (sim.ideal.get(k) ?? 0)) > 1e-9;
                    return (
                      <tr key={k}>
                        <td style={{ fontFamily: 'var(--mono)' }}>{k}</td>
                        <td className="num">{((sim.ideal.get(k) ?? 0) * 100).toFixed(1)}%</td>
                        <td className="num" style={{ color: bad ? 'var(--bad)' : undefined, fontWeight: bad ? 700 : undefined }}>{((sim.after.get(k) ?? 0) * 100).toFixed(1)}%</td>
                        <td className="num">{(((sim.hb.get(k) ?? 0) / sim.shots) * 100).toFixed(1)}%</td>
                        <td className="num">{(((sim.ha.get(k) ?? 0) / sim.shots) * 100).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }} className="small">
              <label className="chk" style={{ flex: '1 1 260px' }}>Two-qubit error rate p₂ = {(p2 * 100).toFixed(1)}%
                <input type="range" min={0} max={0.05} step={0.001} value={p2} onChange={(e) => setP2(Number(e.target.value))} style={{ flex: 1 }} aria-label="Two-qubit error rate" />
              </label>
              <span className="muted">p₁ = p₂/7.5, readout {(DEFAULT_NOISE.readout * 100).toFixed(0)}%, {sim.shots} shots, simulated depolarizing noise (not hardware)</span>
            </div>
            {sim.deterministic && sim.top && (
              <p className="small" style={{ marginTop: 10 }}>
                Correct answer <code>{sim.top[0]}</code> observed in <strong>{(((sim.hb.get(sim.top[0]) ?? 0) / sim.shots) * 100).toFixed(1)}%</strong> of noisy runs before and <strong style={{ color: 'var(--accent-ink)' }}>{(((sim.ha.get(sim.top[0]) ?? 0) / sim.shots) * 100).toFixed(1)}%</strong> after.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
