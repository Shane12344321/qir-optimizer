// Built-in example programs, shared by the CLI, the tests and the walkthrough.

export interface Example {
  id: string;
  title: string;
  blurb: string;
  /** What a reader should look for when the optimizer runs. */
  watch: string;
  source: string;
  /** How to read the output for non-specialists, e.g. the sum register as an integer. */
  answer?: { label: string; register: number; expect?: string };
}

export const EXAMPLES: Example[] = [
  {
    id: 'hybrid-demo',
    title: 'Small hybrid program',
    blurb: 'Three qubits, five gates, one if-statement.',
    watch: 'q0 is set to 1 and copied onto q1, so measuring q1 always gives 1 and the if-branch can never run. Two H gates undo each other. Only 2 gates remain and the branch disappears.',
    source: `OPENQASM 2.0;
include "qelib1.inc";
qreg q[3];
creg c[1];
creg out[2];

x q[0];                 // set q0 to 1
cx q[0], q[1];          // copy q0 onto q1, so q1 is 1 too
h q[2];
h q[2];                 // two H gates in a row undo each other
measure q[1] -> c[0];   // always reads 1
if (c == 0) x q[2];     // can never happen
measure q[0] -> out[0];
measure q[2] -> out[1];
`,
  },
  {
    id: 'hybrid-demo-superposition',
    title: 'Small hybrid program, q0 in superposition',
    blurb: 'The same program, but q0 starts as a 50/50 mix.',
    watch: 'Now q1 is random, so the measurement is random and the if-branch may run. The optimizer still removes the two H gates, but it keeps the CX and the branch, and explains why.',
    source: `OPENQASM 2.0;
include "qelib1.inc";
qreg q[3];
creg c[1];
creg out[2];

h q[0];                 // q0 is now a 50/50 mix of 0 and 1
cx q[0], q[1];          // q1 is linked to q0, so it is random too
h q[2];
h q[2];                 // two H gates in a row undo each other
measure q[1] -> c[0];   // random: 0 or 1
if (c == 0) x q[2];     // may happen
measure q[0] -> out[0];
measure q[2] -> out[1];
`,
  },
  {
    id: 'basics',
    title: 'Basics: what cancels and what must not',
    blurb: 'Redundant gate pairs next to look-alikes that are not redundant.',
    watch: 'Three pairs cancel, two rotations merge through a CNOT, and two lookalike pairs are kept because something between them changes the outcome.',
    source: `OPENQASM 2.0;
include "qelib1.inc";
qreg q[3];
creg c[3];

// redundant pairs: each gate undoes the previous one
h q[0]; h q[0];
x q[1]; x q[1];
cx q[0], q[1]; cx q[0], q[1];

// lookalikes that must NOT cancel
h q[2]; x q[2]; h q[2];      // an X sits between the two H gates
h q[0];
measure q[0] -> c[0];        // a measurement sits in between
h q[0];

// rotations on a control wire slide through the CNOT and merge to nothing
h q[1];
rz(pi/4) q[1];
cx q[1], q[2];
rz(-pi/4) q[1];

measure q[1] -> c[1];
measure q[2] -> c[2];
`,
  },
  {
    id: 'adder',
    title: 'Quantum adder: 3 + 5',
    blurb: 'A 4-bit ripple-carry adder (Cuccaro et al.) with a classical overflow check.',
    watch: 'Because the inputs are known, the analysis proves every qubit’s value at compile time: controlled gates fold away, the overflow measurement is proven to be 0, and the overflow branch is deleted.',
    answer: { label: 'sum', register: 0, expect: '1000' },
    source: `OPENQASM 2.0;
include "qelib1.inc";
// Cuccaro ripple-carry adder: b := a + b
gate majority a, b, c { cx c, b; cx c, a; ccx a, b, c; }
gate unmaj a, b, c { ccx a, b, c; cx c, a; cx a, b; }

qreg cin[1];
qreg a[4];
qreg b[4];
qreg cout[1];
qreg flag[1];
creg sum[4];
creg carry[1];
creg overflow[1];

// load the inputs: a = 3 (0011), b = 5 (0101)
x a[0]; x a[1];
x b[0]; x b[2];

majority cin[0], b[0], a[0];
majority a[0], b[1], a[1];
majority a[1], b[2], a[2];
majority a[2], b[3], a[3];
cx a[3], cout[0];
unmaj a[2], b[3], a[3];
unmaj a[1], b[2], a[2];
unmaj a[0], b[1], a[1];
unmaj cin[0], b[0], a[0];

measure b -> sum;
measure cout[0] -> carry[0];

// classical post-processing: raise a flag if the sum overflowed 4 bits
if (carry == 1) x flag[0];
measure flag[0] -> overflow[0];
`,
  },
  {
    id: 'adder-superposition',
    title: 'Quantum adder in superposition',
    blurb: 'The same adder, but a holds all of 0–3 at once.',
    watch: 'Now the inputs are not known, so most gates must stay. The analysis still simplifies the parts that touch only b, and it refuses to fold the overflow branch, because the carry now depends on a superposition.',
    answer: { label: 'sum', register: 0 },
    source: `OPENQASM 2.0;
include "qelib1.inc";
gate majority a, b, c { cx c, b; cx c, a; ccx a, b, c; }
gate unmaj a, b, c { ccx a, b, c; cx c, a; cx a, b; }

qreg cin[1];
qreg a[4];
qreg b[4];
qreg cout[1];
qreg flag[1];
creg sum[4];
creg carry[1];
creg overflow[1];

// a = superposition of 0, 1, 2, 3 ; b = 5
h a[0]; h a[1];
x b[0]; x b[2];

majority cin[0], b[0], a[0];
majority a[0], b[1], a[1];
majority a[1], b[2], a[2];
majority a[2], b[3], a[3];
cx a[3], cout[0];
unmaj a[2], b[3], a[3];
unmaj a[1], b[2], a[2];
unmaj a[0], b[1], a[1];
unmaj cin[0], b[0], a[0];

measure b -> sum;
measure cout[0] -> carry[0];
if (carry == 1) x flag[0];
measure flag[0] -> overflow[0];
`,
  },
  {
    id: 'grover',
    title: 'Grover search: find the prize in 8 boxes',
    blurb: 'Two Grover iterations searching for box 5 (binary 101), built from library gates.',
    watch: 'Inlining the oracle and diffuser leaves H gates back-to-back at every boundary. The peephole pass removes them, which raises the success rate on noisy hardware.',
    answer: { label: 'box', register: 0, expect: '101' },
    source: `OPENQASM 2.0;
include "qelib1.inc";
// Grover search over 8 boxes for the marked item |101> (box 5)
gate oracle a, b, c { x b; h c; ccx a, b, c; h c; x b; }
gate diffuser a, b, c {
  h a; h b; h c;
  x a; x b; x c;
  h c; ccx a, b, c; h c;
  x a; x b; x c;
  h a; h b; h c;
}

qreg q[3];
creg c[3];

h q;
oracle q[0], q[1], q[2];
diffuser q[0], q[1], q[2];
oracle q[0], q[1], q[2];
diffuser q[0], q[1], q[2];
measure q -> c;
`,
  },
  {
    id: 'teleport',
    title: 'Teleportation with feed-forward',
    blurb: 'Mid-circuit measurements drive classical corrections.',
    watch: 'The corrections depend on genuinely random measurements, so the optimizer keeps both branches and explains why. Knowing when not to fold matters as much as folding.',
    answer: { label: 'out', register: 2, expect: '0' },
    source: `OPENQASM 2.0;
include "qelib1.inc";
// Teleport Ry(1.2)|0> from q[0] to q[2], then undo it: out should always read 0
qreg q[3];
creg c0[1];
creg c1[1];
creg out[1];

ry(1.2) q[0];
h q[1];
cx q[1], q[2];
cx q[0], q[1];
h q[0];
measure q[0] -> c0[0];
measure q[1] -> c1[0];
if (c1 == 1) x q[2];
if (c0 == 1) z q[2];
ry(-1.2) q[2];
measure q[2] -> out[0];
`,
  },
  {
    id: 'legacy-qir',
    title: 'Review 1 sample (raw QIR, typed pointers)',
    blurb: 'Hand-written QIR in the older typed-pointer style, operating on function parameters.',
    watch: 'The parameters q0 and q1 could point to the same qubit, so the optimizer refuses to reorder across them (alias analysis). The obvious pairs still cancel.',
    source: `%Qubit = type opaque

define void @demo(%Qubit* %q0, %Qubit* %q1) {
entry:
  call void @__quantum__qis__h(%Qubit* %q0)
  call void @__quantum__qis__h(%Qubit* %q0)
  call void @__quantum__qis__x(%Qubit* %q1)
  call void @__quantum__qis__x(%Qubit* %q1)
  call void @__quantum__qis__cnot(%Qubit* %q0, %Qubit* %q1)
  call void @__quantum__qis__cnot(%Qubit* %q0, %Qubit* %q1)
  call void @__quantum__qis__h(%Qubit* %q0)
  call void @__quantum__qis__x(%Qubit* %q1)
  call void @__quantum__qis__h(%Qubit* %q0)
  ret void
}

declare void @__quantum__qis__h(%Qubit*)
declare void @__quantum__qis__x(%Qubit*)
declare void @__quantum__qis__cnot(%Qubit*, %Qubit*)
`,
  },
];

export function exampleById(id: string): Example {
  const e = EXAMPLES.find((x) => x.id === id);
  if (!e) throw new Error(`unknown example '${id}'`);
  return e;
}
