// The gates used in this project, each drawn exactly as the circuit figures draw it.

import { useMemo } from 'react';
import { compileQasm } from '@core';
import { Circuit } from './Circuit';

interface Row {
  body: string;
  qubits: number;
  name: string;
  does: string;
  example: string;
  undo: string;
}

const ROWS: Row[] = [
  { body: 'x q[0];', qubits: 1, name: 'X', does: 'Flips the qubit, like NOT.', example: '0 → 1, 1 → 0', undo: 'undoes itself' },
  { body: 'h q[0];', qubits: 1, name: 'H (Hadamard)', does: 'Turns a plain 0 or 1 into an even mix of both.', example: '0 → 50% 0, 50% 1', undo: 'undoes itself' },
  { body: 'z q[0];\ns q[0];\nt q[0];', qubits: 1, name: 'Z, S, T', does: 'Phase gates: a hidden twist that only matters once other gates act.', example: 'on a plain 0 or 1: no visible change', undo: 'Z undoes itself; S and T are undone by S† and T†' },
  { body: 'rz(pi/4) q[0];', qubits: 1, name: 'Rz, Rx, Ry', does: 'Rotate the qubit by an angle; two rotations on the same axis add up.', example: 'Rz(a) then Rz(b) = Rz(a + b)', undo: 'undone by the opposite angle' },
  { body: 'cx q[0], q[1];', qubits: 2, name: 'CX (CNOT)', does: 'Flips the target (⊕) only when the control (●) is 1.', example: '10 → 11, 00 → 00', undo: 'undoes itself' },
  { body: 'cz q[0], q[1];', qubits: 2, name: 'CZ', does: 'Adds a phase twist only when both qubits are 1.', example: 'on plain values: no visible change', undo: 'undoes itself' },
  { body: 'swap q[0], q[1];', qubits: 2, name: 'SWAP', does: 'Exchanges two qubits.', example: '01 → 10', undo: 'undoes itself' },
  { body: 'ccx q[0], q[1], q[2];', qubits: 3, name: 'CCX (Toffoli)', does: 'Flips the target only when both controls are 1, like AND.', example: '110 → 111', undo: 'undoes itself' },
  { body: 'measure q[0] -> c[0];', qubits: 1, name: 'Measure', does: 'Reads out a plain 0 or 1 and ends any mix.', example: '50/50 mix → 0 or 1', undo: 'cannot be undone' },
];

function Glyph({ row }: { row: Row }) {
  const module = useMemo(
    () => compileQasm(`OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[${row.qubits}];\ncreg c[1];\n${row.body}\n`).module,
    [row],
  );
  return <Circuit module={module} colW={44} rowH={34} showBlocks={false} label={`${row.name} gate`} />;
}

export function GateLegend() {
  return (
    <ul className="gate-legend" aria-label="Gate reference">
      {ROWS.map((r) => (
        <li key={r.name}>
          <div className="glyph"><Glyph row={r} /></div>
          <div>
            <strong>{r.name}</strong>
            <p>{r.does}</p>
            <p className="ex">{r.example} · {r.undo}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
