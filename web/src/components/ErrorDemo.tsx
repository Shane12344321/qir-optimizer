// Live front-end: edit a program with mistakes and watch every diagnostic update.

import { useMemo, useState } from 'react';
import { runProgram } from '../lib/run';
import { CodeView } from './CodeView';

export const BROKEN = `OPENQASM 2.0;
include "qelib1.inc";
qreg q[2]
creg c[2];
hadamard q[0];
cx q[0], q[0];
rz(pi/0) q[1];
x q[2];
measure q -> c;
`;

export function ErrorDemo({ height = 300 }: { height?: number }) {
  const [src, setSrc] = useState(BROKEN);
  const run = useMemo(() => runProgram(src), [src]);
  return (
    <div className="plate">
      <div className="panes">
        <div>
          <div className="pane-h"><span>input.qasm</span><button className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setSrc(BROKEN)}>reset</button></div>
          <textarea className="editor" wrap="off" style={{ minHeight: height - 50 }} spellCheck={false} value={src} onChange={(e) => setSrc(e.target.value)} aria-label="OpenQASM source" />
        </div>
        <div>
          <div className="pane-h"><span>{run.ok ? 'QIR' : 'Compiler messages'}</span><span>{run.ok ? 'compiled' : `${run.error.split(/\n\n/).length} errors`}</span></div>
          {run.ok ? <CodeView text={run.result.inputText} maxHeight={height} /> : <pre className="diag" style={{ margin: 0, maxHeight: height, overflow: 'auto', borderTop: 0 }}>{run.error}</pre>}
        </div>
      </div>
    </div>
  );
}
