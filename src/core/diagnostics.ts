// Compiler diagnostics with source positions, rendered in a rustc-like style.

export interface Span {
  line: number; // 1-based
  col: number; // 1-based
  length: number;
}

export type Severity = 'error' | 'warning' | 'note';

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  span?: Span;
  hint?: string;
}

export class CompileError extends Error {
  constructor(public diagnostics: Diagnostic[], public source: string, public fileName = '<input>') {
    super(diagnostics.map((d) => d.message).join('\n'));
    this.name = 'CompileError';
  }
}

export function renderDiagnostic(d: Diagnostic, source: string, fileName = '<input>'): string {
  const out: string[] = [];
  out.push(`${d.severity}[${d.code}]: ${d.message}`);
  if (d.span) {
    const lines = source.split('\n');
    const text = lines[d.span.line - 1] ?? '';
    const gutter = String(d.span.line).length;
    const pad = ' '.repeat(gutter);
    out.push(`${pad}--> ${fileName}:${d.span.line}:${d.span.col}`);
    out.push(`${pad} |`);
    out.push(`${d.span.line} | ${text}`);
    out.push(`${pad} | ${' '.repeat(Math.max(0, d.span.col - 1))}${'^'.repeat(Math.max(1, d.span.length))}`);
  }
  if (d.hint) out.push(`  = hint: ${d.hint}`);
  return out.join('\n');
}

export function renderDiagnostics(ds: Diagnostic[], source: string, fileName?: string): string {
  return ds.map((d) => renderDiagnostic(d, source, fileName)).join('\n\n');
}
