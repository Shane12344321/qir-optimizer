// Two-qubit explorer: apply gates and watch the probability of each measurement outcome.

import { useMemo, useState } from 'react';
import { compileQasm, StateVector, type GateName } from '@core';
import { Circuit } from './Circuit';

type Op = { gate: GateName; qubits: number[] };

export function StateExplorer() {
  const [ops, setOps] = useState<Op[]>([{ gate: 'h', qubits: [0] }]);
  const probs = useMemo(() => {
    const s = new StateVector(2);
    for (const o of ops) s.apply(o.gate, o.qubits);
    return s.probabilities();
  }, [ops]);
  const module = useMemo(() => {
    const body = ops.map((o) => `${o.gate} ${o.qubits.map((q) => `q[${q}]`).join(', ')};`).join('\n');
    return compileQasm(`OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\n${body}\n`).module;
  }, [ops]);
  const add = (gate: GateName, qubits: number[]) => setOps((o) => (o.length >= 10 ? o : [...o, { gate, qubits }]));
  const entangled = Math.abs(probs[0] - 0.5) < 1e-9 && Math.abs(probs[3] - 0.5) < 1e-9;
  const single = [...probs].findIndex((p) => p > 1 - 1e-9);

  return (
    <div className="plate">
      <div className="plate-bar">
        <span className="seg" role="group" aria-label="Single-qubit gates">
          <button className="btn" onClick={() => add('h', [0])}>H on q₀</button>
          <button className="btn" onClick={() => add('x', [0])}>X on q₀</button>
          <button className="btn" onClick={() => add('h', [1])}>H on q₁</button>
          <button className="btn" onClick={() => add('x', [1])}>X on q₁</button>
        </span>
        <span className="seg" role="group" aria-label="Two-qubit gates">
          <button className="btn" onClick={() => add('cx', [0, 1])}>CX q₀→q₁</button>
        </span>
        <span className="grow" />
        <button className="btn" onClick={() => setOps((o) => o.slice(0, -1))} disabled={!ops.length}>Undo</button>
        <button className="btn" onClick={() => setOps([])} disabled={!ops.length}>Clear</button>
      </div>
      <div className="panes">
        <div>
          <div className="pane-h"><span>Program</span><span>{ops.length} gate{ops.length === 1 ? '' : 's'}, left to right</span></div>
          <div className="plate-body"><Circuit module={module} minCols={6} colW={50} rowH={42} /></div>
        </div>
        <div>
          <div className="pane-h"><span>If you measure both qubits</span><span>probability</span></div>
          <div className="plate-body">
            <div className="bars">
              {[0, 1, 2, 3].map((k) => (
                <div className="row" key={k} style={{ gridTemplateColumns: '120px 1fr 56px' }}>
                  <span>q₁ = {(k >> 1) & 1}, q₀ = {k & 1}</span>
                  <span className="track"><span className="fill" style={{ width: `${probs[k] * 100}%` }} /></span>
                  <span className="v">{(probs[k] * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
            <p className="small" style={{ margin: '12px 0 0' }}>
              {single >= 0
                ? 'Every run gives the same answer: the qubits hold plain classical values, which the optimizer can track (§7).'
                : entangled
                  ? 'Entangled: only 00 or 11 ever appear, never 01 or 10. Neither qubit has a value of its own, so the optimizer must treat both as unknown.'
                  : 'The outcome is random: at least one qubit is in a superposition, so its value is unknown until measured.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
