// qiropt — command-line driver for the QIR optimizer.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import {
  checkEquivalence, CompileError, compileQasm, DEFAULT_NOISE, loadProgram, optimize, type OptimizeOptions,
  outputDistribution, PRESETS, renderDiagnostics, RULES, sampleShots, BLOCK_REASONS,
} from '../core';
import { runBenchmarks, type BenchRow } from '../core/bench';
import { EXAMPLES, exampleById } from '../core/examples';
import { llvmAvailable, llvmToolName, verifyWithLlvm } from './llvm';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (s: string | number) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  bold: paint('1'), dim: paint('2'), red: paint('31'), green: paint('32'), yellow: paint('33'),
  blue: paint('34'), magenta: paint('35'), cyan: paint('36'),
};

const VERSION = '1.0.0';

function usage(): never {
  console.log(`${c.bold('qiropt')} ${VERSION} — a hybrid-aware, self-verifying QIR optimizer

${c.bold('Usage')}
  qiropt compile <file.qasm> [-o out.ll]        OpenQASM 2.0 → QIR
  qiropt opt <file> [-o out.ll] [options]       optimize QIR (or QASM) and explain every change
  qiropt verify <a> <b>                         check two programs are equivalent
  qiropt run <file> [--shots N] [--noise]       simulate and print the output distribution
  qiropt bench [--out dir] [--fast]             benchmark suite + ablation study
  qiropt examples                               list built-in examples (use example:<id> as a file)

${c.bold('Options for opt')}
  --preset adjacent-only|peephole|full          pass configuration (default: full)
  --no-cancel --no-commute --no-merge --no-qconst --no-cfg
  --validate each|final|none                    translation validation (default: final)
  --trace trace.json                            write every rewrite/refusal as JSON
  --quiet                                       only print the summary
`);
  process.exit(0);
}

function readSource(path: string): { source: string; name: string } {
  if (path.startsWith('example:')) {
    const e = exampleById(path.slice('example:'.length));
    return { source: e.source, name: `${e.id}${e.source.includes('OPENQASM') ? '.qasm' : '.ll'}` };
  }
  return { source: readFileSync(path, 'utf8'), name: basename(path) };
}

function flag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

function write(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function pct(before: number, after: number): string {
  if (before === 0) return '—';
  return `${(((before - after) / before) * 100).toFixed(0)}%`;
}

function cmdCompile(args: string[]) {
  const out = option(args, '-o');
  const { source, name } = readSource(args[0] ?? usage());
  const r = compileQasm(source, name);
  for (const d of r.diagnostics) console.error(renderDiagnostics([d], source, name));
  if (out) {
    write(out, r.qir);
    console.error(`${c.green('✓')} wrote ${out} (${r.circuit.numQubits} qubits, ${r.circuit.numResults} results)`);
  } else process.stdout.write(r.qir);
}

function cmdOpt(args: string[]) {
  const out = option(args, '-o');
  const tracePath = option(args, '--trace');
  const preset = option(args, '--preset') ?? 'full';
  const validate = (option(args, '--validate') ?? 'final') as OptimizeOptions['validate'];
  const quiet = flag(args, '--quiet');
  const opts: OptimizeOptions = { ...(PRESETS[preset] ?? usage()), validate };
  for (const p of ['cancel', 'commute', 'merge', 'qconst', 'cfg'] as const) if (flag(args, `--no-${p}`)) opts[p] = false;
  const { source, name } = readSource(args[0] ?? usage());

  const loaded = loadProgram(source, name);
  const r = optimize(loaded.module, opts);

  if (!quiet) {
    console.log(c.bold(`\n  QIR optimization report — ${name}`) + c.dim(`  (${loaded.kind === 'qasm' ? 'compiled from OpenQASM' : 'QIR input'}, preset ${preset})\n`));
    for (const e of r.events) {
      const where = e.srcLines?.length ? c.dim(` [src ${e.srcLines.join(',')}]`) : e.linesBefore?.length ? c.dim(` [ir ${e.linesBefore.join(',')}]`) : '';
      if (e.kind === 'rewrite') {
        const info = RULES[e.rule];
        const ok = e.validated ? (e.validated.equivalent ? c.green(' ✓') : c.red(' ✗ INVALID')) : '';
        console.log(`  ${c.green('▸')} ${c.bold(info.title)} ${c.dim(`· ${info.concept}`)}${ok}`);
        console.log(`    ${e.message}${where}`);
      } else {
        console.log(`  ${c.yellow('■')} ${c.bold('Refused')} ${c.dim(`· ${BLOCK_REASONS[e.reason]}`)}`);
        console.log(`    ${e.message}${where}`);
      }
    }
    if (!r.events.length) console.log(c.dim('  (no opportunities found)'));
  }

  const b = r.before;
  const a = r.after;
  console.log(`\n  ${c.bold('metric'.padEnd(14))}${'before'.padStart(8)}${'after'.padStart(8)}${'saved'.padStart(8)}`);
  for (const [label, x, y] of [['gates', b.gates, a.gates], ['two-qubit', b.twoQubit, a.twoQubit], ['depth', b.depth, a.depth], ['basic blocks', b.blocks, a.blocks]] as const) {
    console.log(`  ${label.padEnd(14)}${String(x).padStart(8)}${String(y).padStart(8)}${c.cyan(pct(x, y).padStart(8))}`);
  }
  console.log(c.dim(`\n  ${r.rewrites.length} rewrites, ${r.refusals.length} refusals, ${r.iterations} fixed-point iteration(s), ${r.timeMs.toFixed(1)} ms`));
  if (r.validation) {
    const v = r.validation;
    if (v.inconclusive) console.log(`  ${c.yellow('?')} equivalence: not checked (${v.detail})`);
    else if (v.equivalent) console.log(`  ${c.green('✓')} equivalence: proven by simulation (${v.method}, ${v.branches} branch${v.branches === 1 ? '' : 'es'}, fidelity ${v.fidelity.toFixed(6)})`);
    else console.log(`  ${c.red('✗')} equivalence FAILED: ${v.detail}`);
  }
  if (llvmAvailable()) {
    const ver = verifyWithLlvm(r.outputText);
    console.log(ver.ok ? `  ${c.green('✓')} LLVM verifier accepts the output ${c.dim(`(${llvmToolName()})`)}` : `  ${c.red('✗')} LLVM rejected the output:\n${ver.message}`);
  }
  if (out) {
    write(out, r.outputText);
    console.log(`  ${c.green('✓')} wrote ${out}`);
  } else if (quiet) {
    // nothing
  } else {
    console.log(c.dim('\n  (use -o out.ll to write the optimized QIR)'));
  }
  if (tracePath) {
    write(tracePath, JSON.stringify({ before: r.before, after: r.after, events: r.events, validation: r.validation }, null, 2));
    console.log(`  ${c.green('✓')} wrote trace ${tracePath}`);
  }
  console.log();
  if (r.validation && !r.validation.equivalent && !r.validation.inconclusive) process.exit(2);
}

function cmdVerify(args: string[]) {
  const [pa, pb] = args;
  if (!pa || !pb) usage();
  const a = loadProgram(readSource(pa).source).module;
  const b = loadProgram(readSource(pb).source).module;
  const v = checkEquivalence(a, b);
  if (v.equivalent) console.log(`${c.green('✓')} equivalent (${v.method}, ${v.branches} branch(es), fidelity ${v.fidelity.toFixed(8)})`);
  else {
    console.log(`${c.red('✗')} NOT equivalent: ${v.detail}  (TVD ${v.tvd.toFixed(4)})`);
    process.exit(1);
  }
}

function cmdRun(args: string[]) {
  const shots = Number(option(args, '--shots') ?? 0);
  const noisy = flag(args, '--noise');
  const { source } = readSource(args[0] ?? usage());
  const m = loadProgram(source).module;
  const dist = noisy || shots
    ? new Map([...sampleShots(m, shots || 2000, { noise: noisy ? DEFAULT_NOISE : undefined })].map(([k, v]) => [k, v / (shots || 2000)]))
    : outputDistribution(m);
  const rows = [...dist].sort((x, y) => y[1] - x[1]);
  console.log(c.bold(`\n  output distribution${noisy ? ` (noise p1=${DEFAULT_NOISE.p1}, p2=${DEFAULT_NOISE.p2}, readout=${DEFAULT_NOISE.readout})` : ' (exact)'}\n`));
  for (const [k, p] of rows.slice(0, 16)) {
    const bar = '█'.repeat(Math.round(p * 40));
    console.log(`  ${k.padEnd(18)} ${(p * 100).toFixed(1).padStart(5)}%  ${c.cyan(bar)}`);
  }
  if (rows.length > 16) console.log(c.dim(`  … ${rows.length - 16} more`));
  console.log();
}

function renderBenchMarkdown(rows: BenchRow[]): string {
  const p = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines = [
    '| Benchmark | Qubits | Gates | Adjacent-only | Peephole (DAG) | Full (hybrid) | Reduction | 2-qubit | Blocks | Equivalent | ESP | Simulated success |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|---:|---:|',
  ];
  for (const r of rows) {
    const f = r.results.full.after;
    const sim = r.metric === 'hellinger' ? `${p(r.successBefore!)} → ${p(r.successAfter!)}` : '—';
    lines.push(`| ${r.id} | ${r.qubits} | ${r.before.gates} | ${r.results['adjacent-only'].after.gates} | ${r.results.peephole.after.gates} | ${f.gates} | ${pct(r.before.gates, f.gates)} | ${r.before.twoQubit} → ${f.twoQubit} | ${r.before.blocks} → ${f.blocks} | ${r.equivalent === true ? '✓' : r.equivalent === false ? '✗' : '—'} | ${p(r.espBefore)} → ${p(r.espAfter)} | ${sim} |`);
  }
  return lines.join('\n');
}

function cmdBench(args: string[]) {
  const outDir = option(args, '--out') ?? 'bench';
  const fast = flag(args, '--fast');
  console.log(c.bold('\n  Benchmark suite · ablation study\n'));
  console.log(c.dim(`  ${'benchmark'.padEnd(28)}${'gates'.padStart(7)}${'adj'.padStart(7)}${'dag'.padStart(7)}${'full'.padStart(7)}${'saved'.padStart(7)}   success (noisy)`));
  const rows = runBenchmarks({
    noiseless: fast,
    verify: llvmAvailable() ? (text) => verifyWithLlvm(text).ok : undefined,
    onRow: (r) => {
      const s = r.successBefore !== undefined ? `${(r.successBefore * 100).toFixed(1)}% → ${(r.successAfter! * 100).toFixed(1)}%${r.metric === 'esp' ? c.dim(' (ESP)') : ''}` : c.dim('—');
      const eq = r.equivalent === true ? c.green('✓') : r.equivalent === false ? c.red('✗') : c.dim('·');
      console.log(`  ${eq} ${r.id.padEnd(26)}${String(r.before.gates).padStart(7)}${String(r.results['adjacent-only'].after.gates).padStart(7)}${String(r.results.peephole.after.gates).padStart(7)}${String(r.results.full.after.gates).padStart(7)}${c.cyan(pct(r.before.gates, r.results.full.after.gates).padStart(7))}   ${s}`);
    },
  });
  const md = renderBenchMarkdown(rows);
  write(`${outDir}/results.json`, JSON.stringify({ generated: new Date().toISOString(), noise: DEFAULT_NOISE, rows }, null, 2));
  write(`${outDir}/results.md`, `# Benchmark results\n\nNoise model: depolarizing p1=${DEFAULT_NOISE.p1}, p2=${DEFAULT_NOISE.p2}, readout=${DEFAULT_NOISE.readout}. ESP = estimated success probability, the chance that a run sees no gate or readout error (product of 1 − p over the program). Simulated success = Hellinger fidelity of 4000 noisy shots against the exact ideal distribution (the probability of the correct answer for deterministic programs; ±~0.5% sampling error); shown only where the output has few enough outcomes to estimate from samples. Equivalent: — means the program has too many measurement branches for exhaustive checking.\n\n${md}\n`);
  const total = rows.reduce((s, r) => s + r.before.gates, 0);
  const saved = rows.reduce((s, r) => s + r.before.gates - r.results.full.after.gates, 0);
  const llvmOk = rows.filter((r) => r.llvmVerified).length;
  if (llvmAvailable()) console.log(`  ${llvmOk === rows.length ? c.green('✓') : c.red('✗')} LLVM verifier accepted ${llvmOk}/${rows.length} optimized modules`);
  console.log(c.dim(`\n  total: ${saved}/${total} gates removed (${pct(total, total - saved)}) · wrote ${outDir}/results.json and ${outDir}/results.md\n`));
  if (rows.some((r) => r.equivalent === false || r.llvmVerified === false)) process.exit(2);
}

function cmdExamples() {
  for (const e of EXAMPLES) console.log(`  ${c.bold(`example:${e.id}`.padEnd(30))} ${e.title}`);
  console.log(c.dim('\n  e.g. qiropt opt example:adder'));
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args.shift();
  try {
    switch (cmd) {
      case 'compile': return cmdCompile(args);
      case 'opt': return cmdOpt(args);
      case 'verify': return cmdVerify(args);
      case 'run': return cmdRun(args);
      case 'bench': return cmdBench(args);
      case 'examples': return cmdExamples();
      case '--version': case '-v': return console.log(VERSION);
      default: return usage();
    }
  } catch (e) {
    if (e instanceof CompileError) {
      console.error(renderDiagnostics(e.diagnostics, e.source, e.fileName));
      console.error(c.red(`\n${e.diagnostics.filter((d) => d.severity === 'error').length} error(s)`));
      process.exit(1);
    }
    throw e;
  }
}

main();
