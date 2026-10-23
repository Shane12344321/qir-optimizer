// The same program through the safe optimizer and the naive one, checked side by side.

import { useMemo, useState } from 'react';
import { checkEquivalence, compileQasm, naiveOptimize, optimize, outputDistribution } from '@core';
import { Circuit } from './Circuit';

const CASES = [
  {
    id: 'hxh',
    label: 'H · X · H',
    note: 'The two H gates look like a cancellable pair, but X sits between them on the same wire and does not commute with H. (HXH = Z, not X.)',
    src: 'h q[0];\nx q[0];\nh q[0];\nmeasure q[0] -> c[0];',
    n: 1,
  },
  {
    id: 'measure',
    label: 'across a measurement',
    note: 'Cancelling H … H across a measurement changes what is observed: the first H makes the measurement random, the second one is applied to a collapsed state.',
    src: 'h q[0];\nmeasure q[0] -> c[0];\nh q[0];\nmeasure q[0] -> c[1];',
    n: 1,
  },
  {
    id: 'rot',
    label: 'rotations across a CNOT target',
    note: 'Rx on the control wire does not commute with the CNOT, so the two rotations cannot be merged into one.',
    src: 'rx(pi/2) q[0];\ncx q[0], q[1];\nrx(pi/2) q[0];\nmeasure q -> c;',
    n: 2,
  },
];

function dist(m: ReturnType<typeof compileQasm>['module']) {
  return [...outputDistribution(m)].sort((a, b) => a[0].localeCompare(b[0]));
}

export function NaiveDemo() {
  const [id, setId] = useState('hxh');
  const c = CASES.find((x) => x.id === id)!;
  const data = useMemo(() => {
    const src = `OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[${c.n}];\ncreg c[${c.id === 'measure' ? 2 : c.n}];\n${c.src}\n`;
    const input = compileQasm(src).module;
    const safe = optimize(input).module;
    const naive = naiveOptimize(input).module;
    return { input, safe, naive, vs: checkEquivalence(input, safe), vn: checkEquivalence(input, naive), d0: dist(input), ds: dist(safe), dn: dist(naive) };
  }, [c]);
  const keys = [...new Set([...data.d0, ...data.dn, ...data.ds].map(([k]) => k))].sort();
  const get = (d: [string, number][], k: string) => d.find(([x]) => x === k)?.[1] ?? 0;

  return (
    <div className="plate">
      <div className="plate-bar">
        <strong>Case</strong>
        <span className="seg" role="group">
          {CASES.map((x) => <button key={x.id} className="btn" aria-pressed={x.id === id} onClick={() => setId(x.id)}>{x.label}</button>)}
        </span>
      </div>
      <div className="small" style={{ padding: '10px 14px', borderBottom: '1px solid var(--rule)' }}>{c.note}</div>
      <div className="panes" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        {([
          ['Input', data.input, undefined],
          ['Our optimizer', data.safe, data.vs],
          ['Naive optimizer', data.naive, data.vn],
        ] as const).map(([label, m, v]) => (
          <div key={label}>
            <div className="pane-h">
              <span>{label}</span>
              {v && <span className={`tag ${v.equivalent ? 'ok' : 'bad'}`}>{v.equivalent ? 'equivalent' : 'rejected'}</span>}
            </div>
            <div className="plate-body" style={{ minHeight: 120 }}><Circuit module={m} colW={46} rowH={40} /></div>
            {v && !v.equivalent && <div className="small" style={{ padding: '0 14px 12px', color: 'var(--bad)' }}>{v.detail} · total variation distance {v.tvd.toFixed(3)}</div>}
          </div>
        ))}
      </div>
      <div className="tablewrap" style={{ borderTop: '1px solid var(--rule)' }}>
        <table>
          <thead><tr><th>outcome</th><th className="num">input</th><th className="num">ours</th><th className="num">naive</th></tr></thead>
          <tbody>
            {keys.map((k) => {
              const off = Math.abs(get(data.dn, k) - get(data.d0, k)) > 1e-9;
              return (
                <tr key={k}>
                  <td style={{ fontFamily: 'var(--mono)' }}>{k}</td>
                  <td className="num">{(get(data.d0, k) * 100).toFixed(1)}%</td>
                  <td className="num">{(get(data.ds, k) * 100).toFixed(1)}%</td>
                  <td className="num" style={{ color: off ? 'var(--bad)' : undefined, fontWeight: off ? 700 : undefined }}>{(get(data.dn, k) * 100).toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
