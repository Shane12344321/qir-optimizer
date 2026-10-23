// Validate QIR text with the real LLVM toolchain (Node only).

import { spawnSync } from 'node:child_process';

function find(): { cmd: string; args: string[] } | undefined {
  const candidates: { cmd: string; args: string[] }[] = [
    { cmd: 'llvm-as', args: ['-o', '/dev/null', '-'] },
    { cmd: 'clang', args: ['-c', '-x', 'ir', '-Wno-override-module', '-', '-o', '/dev/null'] },
  ];
  for (const c of candidates) {
    const probe = spawnSync(c.cmd, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return c;
  }
  return undefined;
}

let tool: { cmd: string; args: string[] } | undefined | null = null;

function getTool() {
  if (tool === null) tool = find();
  return tool;
}

export function llvmAvailable(): boolean {
  return getTool() !== undefined;
}

export function llvmToolName(): string | undefined {
  const t = getTool();
  if (!t) return undefined;
  const v = spawnSync(t.cmd, ['--version'], { encoding: 'utf8' }).stdout.split('\n')[0];
  return v.trim();
}

export function verifyWithLlvm(text: string): { ok: boolean; message: string } {
  const t = getTool();
  if (!t) return { ok: false, message: 'no LLVM tool (llvm-as or clang) found on PATH' };
  const r = spawnSync(t.cmd, t.args, { input: text, encoding: 'utf8' });
  const message = (r.stderr || '').replace(/^warning: overriding the module target triple.*\n?/m, '').replace(/^1 warning generated\.\n?/m, '').trim();
  return { ok: r.status === 0, message };
}
