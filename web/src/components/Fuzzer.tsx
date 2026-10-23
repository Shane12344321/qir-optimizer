// Live property-based test: random programs, optimized and checked in this page.

import { useEffect, useRef, useState } from 'react';
import { checkEquivalence, compileQasm, naiveOptimize, optimize } from '@core';
import { randomProgram } from '@engine/random';

interface Tally {
  programs: number;
  rewrites: number;
  gatesBefore: number;
  gatesAfter: number;
  equivalent: number;
  failures: number;
  naiveBroken: number;
  branchesFolded: number;
  lastFailure?: string;
}

const ZERO: Tally = { programs: 0, rewrites: 0, gatesBefore: 0, gatesAfter: 0, equivalent: 0, failures: 0, naiveBroken: 0, branchesFolded: 0 };

export function Fuzzer() {
  const [t, setT] = useState<Tally>(ZERO);
  const [running, setRunning] = useState(false);
  const seed = useRef(Math.floor(Math.random() * 1e9));
  const target = useRef(500);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let done = tRef.current.programs;
    const tick = () => {
      if (cancelled) return;
      const d = { ...ZERO };
      const deadline = performance.now() + 24;
      while (performance.now() < deadline && done < target.current) {
        const s = seed.current++;
        const src = randomProgram({ qubits: 1 + (s % 5), gates: 4 + (s % 36), seed: s, redundancy: 0.4, dynamic: s % 2 === 0 });
        const input = compileQasm(src).module;
        const r = optimize(input, { explain: false });
        const v = checkEquivalence(input, r.module);
        done++;
        d.programs++;
        d.rewrites += r.rewrites.length;
        d.gatesBefore += r.before.gates;
        d.gatesAfter += r.after.gates;
        d.branchesFolded += r.rewrites.filter((e) => e.rule === 'fold-branch').length;
        if (v.equivalent) d.equivalent++;
        else if (!v.inconclusive) {
          d.failures++;
          d.lastFailure = src;
        }
        if (!checkEquivalence(input, naiveOptimize(input).module).equivalent) d.naiveBroken++;
      }
      setT((prev) => ({
        programs: prev.programs + d.programs,
        rewrites: prev.rewrites + d.rewrites,
        gatesBefore: prev.gatesBefore + d.gatesBefore,
        gatesAfter: prev.gatesAfter + d.gatesAfter,
        equivalent: prev.equivalent + d.equivalent,
        failures: prev.failures + d.failures,
        naiveBroken: prev.naiveBroken + d.naiveBroken,
        branchesFolded: prev.branchesFolded + d.branchesFolded,
        lastFailure: d.lastFailure ?? prev.lastFailure,
      }));
    };
    const id = setInterval(tick, 30);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [running]);

  useEffect(() => {
    if (t.programs >= target.current) setRunning(false);
  }, [t.programs]);

  const pct = t.gatesBefore ? Math.round((1 - t.gatesAfter / t.gatesBefore) * 100) : 0;
  return (
    <div className="plate">
      <div className="plate-bar">
        <strong>Random-program check</strong>
        <span className="muted">1–5 qubits · 4–40 operations · half with mid-circuit measurement, reset and feed-forward</span>
        <span className="grow" />
        <button className="btn primary" onClick={() => { if (t.programs >= target.current) { target.current += 500; } setRunning((r) => !r); }}>
          {running ? 'Pause' : t.programs === 0 ? 'Run 500 programs' : t.programs >= target.current ? 'Run 500 more' : 'Resume'}
        </button>
      </div>
      <div className="plate-body">
        {t.programs === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>Not run yet. Each run generates 500 fresh programs from a random seed, optimizes each with the full pipeline and checks it for equivalence; the naive optimizer runs on the same inputs as a control. Takes about ten seconds.</p>
        ) : (<>
        <div className="stats-line">
          <span><b>{t.programs.toLocaleString()}</b>programs</span>
          <span><b>{t.equivalent.toLocaleString()}</b>proven equivalent</span>
          <span><b style={{ color: t.failures ? 'var(--bad)' : undefined }}>{t.failures}</b>counterexamples</span>
          <span><b>{t.rewrites.toLocaleString()}</b>rewrites applied</span>
          <span><b>{pct}%</b>gates removed</span>
          <span><b>{t.branchesFolded}</b>branches folded</span>
        </div>
        <p className="small muted" style={{ margin: '12px 0 0' }}>
          Control group: the naive optimizer broke <strong style={{ color: 'var(--bad)' }}>{t.naiveBroken.toLocaleString()}</strong> of the same {t.programs.toLocaleString()} programs, so the checker detects unsafe rewrites when they occur. Programs whose measurement branches exceed 4,096 are skipped, not counted as passes.
        </p>
        {t.lastFailure && <pre className="diag">{t.lastFailure}</pre>}
        </>)}
      </div>
    </div>
  );
}
