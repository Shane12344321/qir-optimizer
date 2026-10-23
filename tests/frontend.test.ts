import { describe, expect, it } from 'vitest';
import { CompileError, compileQasm, renderDiagnostics } from '../src/core';
import { lex } from '../src/core/qasm/lexer';

function errorsOf(src: string) {
  try {
    compileQasm(src);
  } catch (e) {
    if (e instanceof CompileError) return e.diagnostics.filter((d) => d.severity === 'error');
    throw e;
  }
  return [];
}

const HEADER = 'OPENQASM 2.0;\ninclude "qelib1.inc";\n';

describe('lexer', () => {
  it('produces tokens with positions', () => {
    const { tokens, diagnostics } = lex('qreg q[2];\nrz(-pi/4) q[1];');
    expect(diagnostics).toEqual([]);
    expect(tokens.map((t) => t.text).slice(0, 6)).toEqual(['qreg', 'q', '[', '2', ']', ';']);
    const rz = tokens.find((t) => t.text === 'rz')!;
    expect(rz.span).toEqual({ line: 2, col: 1, length: 2 });
    expect(tokens.find((t) => t.text === 'pi')!.kind).toBe('keyword');
  });

  it('skips line and block comments', () => {
    const { tokens } = lex('// hi\n/* multi\nline */ h q;');
    expect(tokens.map((t) => t.text)).toEqual(['h', 'q', ';', '']);
  });

  it('reports unexpected characters', () => {
    expect(lex('h q[0]; $').diagnostics[0].message).toMatch(/unexpected character/);
  });
});

describe('parser and semantic analysis', () => {
  it('compiles a valid program and folds parameter expressions', () => {
    const r = compileQasm(`${HEADER}qreg q[1];\nrz(2*pi/8 - pi/4 + 0.5) q[0];`);
    const gate = r.circuit.ops[0];
    expect(gate.kind).toBe('gate');
    if (gate.kind === 'gate') expect(gate.params[0]).toBeCloseTo(0.5, 12);
  });

  it('broadcasts gates over whole registers', () => {
    const r = compileQasm(`${HEADER}qreg a[3];\nqreg b[3];\ncx a, b;`);
    expect(r.circuit.ops.map((o) => (o.kind === 'gate' ? o.qubits : []))).toEqual([[0, 3], [1, 4], [2, 5]]);
  });

  it('expands user gates with parameters', () => {
    const r = compileQasm(`${HEADER}gate g(t) a, b { rz(t/2) a; cx a, b; }\nqreg q[2];\ng(pi) q[1], q[0];`);
    expect(r.circuit.ops).toMatchObject([
      { kind: 'gate', gate: 'rz', qubits: [1] },
      { kind: 'gate', gate: 'cx', qubits: [1, 0] },
    ]);
  });

  it('suggests the closest gate name', () => {
    const hint = (call: string) => errorsOf(`${HEADER}qreg q[2];\n${call}`)[0].hint;
    expect(hint('hadamard q[0];')).toBe("did you mean 'h'?");
    expect(hint('cnot q[0], q[1];')).toBe("did you mean 'cx'?");
    expect(hint('rzz(pi) q[0];')).toBe("did you mean 'rz'?");
  });

  it('points at a missing semicolon and recovers to find later errors', () => {
    const errs = errorsOf(`${HEADER}qreg q[2]\nh q[0];\nx q[5];`);
    expect(errs[0].message).toMatch(/expected ';'/);
    expect(errs[0].span!.line).toBe(3);
    expect(errs.some((e) => e.message.includes('out of bounds'))).toBe(true);
  });

  it('rejects out-of-range indices, duplicate qubits and unknown registers', () => {
    expect(errorsOf(`${HEADER}qreg q[2];\nh q[2];`)[0].message).toMatch(/index 2 is out of bounds/);
    expect(errorsOf(`${HEADER}qreg q[2];\ncx q[1], q[1];`)[0].message).toMatch(/same qubit more than once/);
    expect(errorsOf(`${HEADER}qreg q[2];\nh r[0];`)[0].message).toMatch(/unknown quantum register 'r'/);
  });

  it('requires qelib1.inc for library gates', () => {
    const [e] = errorsOf('OPENQASM 2.0;\nqreg q[1];\nh q[0];');
    expect(e.message).toMatch(/qelib1.inc/);
    expect(errorsOf('OPENQASM 2.0;\nqreg q[1];\nU(0,0,0) q[0];')).toEqual([]);
  });

  it('checks gate arity and measurement sizes', () => {
    expect(errorsOf(`${HEADER}qreg q[2];\nrz q[0];`)[0].message).toMatch(/takes 1 parameter/);
    expect(errorsOf(`${HEADER}qreg q[2];\ncx q[0];`)[0].message).toMatch(/acts on 2 qubit/);
    expect(errorsOf(`${HEADER}qreg q[2];\ncreg c[3];\nmeasure q -> c;`)[0].message).toMatch(/cannot measure 2/);
  });

  it('renders rustc-style diagnostics', () => {
    const src = `${HEADER}qreg q[2];\nh q[7];`;
    try {
      compileQasm(src, 'demo.qasm');
      expect.unreachable();
    } catch (e) {
      const text = renderDiagnostics((e as CompileError).diagnostics, src, 'demo.qasm');
      expect(text).toContain('--> demo.qasm:4:3');
      expect(text).toContain('h q[7];');
      expect(text).toContain('^^^^');
    }
  });
});
