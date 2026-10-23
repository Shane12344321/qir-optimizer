import bench from '../data/bench.json';
import tests from '../data/tests.json';
import type { BenchRow } from '../components/Charts';

export const BENCH = bench as unknown as { generated: string; noise: { p1: number; p2: number; readout: number }; rows: BenchRow[] };
export const ROWS = BENCH.rows;

const sum = (f: (r: BenchRow) => number) => ROWS.reduce((s, r) => s + f(r), 0);
export const TOTAL_BEFORE = sum((r) => r.before.gates);
export const TOTAL = {
  adjacent: sum((r) => r.results['adjacent-only'].after.gates),
  peephole: sum((r) => r.results.peephole.after.gates),
  full: sum((r) => r.results.full.after.gates),
};
export const REDUCTION = {
  adjacent: 1 - TOTAL.adjacent / TOTAL_BEFORE,
  peephole: 1 - TOTAL.peephole / TOTAL_BEFORE,
  full: 1 - TOTAL.full / TOTAL_BEFORE,
};
export const TWOQ = {
  before: sum((r) => r.before.twoQubit),
  full: sum((r) => r.results.full.after.twoQubit),
};
export const VERIFIED = ROWS.filter((r) => r.equivalent === true).length;
export const LLVM_OK = ROWS.filter((r) => (r as BenchRow & { llvmVerified?: boolean }).llvmVerified).length;
export const SKIPPED = ROWS.filter((r) => r.equivalent === 'skipped').length;

interface TestFile {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  startTime: number;
  testResults: { name: string; assertionResults: { ancestorTitles: string[]; title: string; status: string; duration?: number }[] }[];
}
export const TESTS = tests as unknown as TestFile;
export const TEST_COUNT = TESTS.numTotalTests;
export const TESTS_PASSED = TESTS.numPassedTests;

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
