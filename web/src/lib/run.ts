import {
  CompileError, type CompileResult, loadProgram, type Module, optimize, type OptimizeOptions, type OptimizeResult,
  renderDiagnostics,
} from '@core';

export type RunOk = {
  ok: true;
  kind: 'qasm' | 'qir';
  input: Module;
  compile?: CompileResult;
  result: OptimizeResult;
  warnings: string;
};
export type RunErr = { ok: false; error: string; lines: number[] };
export type Run = RunOk | RunErr;

const cache = new Map<string, Run>();

export function runProgram(source: string, options: OptimizeOptions = {}): Run {
  const key = `${JSON.stringify(options)}\u0000${source}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let out: Run;
  try {
    const loaded = loadProgram(source, 'program');
    const result = optimize(loaded.module, { snapshots: true, validate: 'each', ...options });
    const warnings = loaded.compile ? renderDiagnostics(loaded.compile.diagnostics.filter((d) => d.severity !== 'error'), source, 'program.qasm') : '';
    out = { ok: true, kind: loaded.kind, input: loaded.module, compile: loaded.compile, result, warnings };
  } catch (e) {
    if (e instanceof CompileError) {
      out = {
        ok: false,
        error: renderDiagnostics(e.diagnostics, e.source, loadedName(source)),
        lines: e.diagnostics.map((d) => d.span?.line).filter((x): x is number => x !== undefined),
      };
    } else {
      out = { ok: false, error: e instanceof Error ? e.message : String(e), lines: [] };
    }
  }
  if (cache.size > 64) cache.clear();
  cache.set(key, out);
  return out;
}

function loadedName(source: string) {
  return /OPENQASM/.test(source) ? 'program.qasm' : 'program.ll';
}
