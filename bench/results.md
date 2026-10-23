# Benchmark results

Noise model: depolarizing p1=0.002, p2=0.015, readout=0.01. ESP = estimated success probability, the chance that a run sees no gate or readout error (product of 1 − p over the program). Simulated success = Hellinger fidelity of 4000 noisy shots against the exact ideal distribution (the probability of the correct answer for deterministic programs; ±~0.5% sampling error); shown only where the output has few enough outcomes to estimate from samples. Equivalent: — means the program has too many measurement branches for exhaustive checking.

| Benchmark | Qubits | Gates | Adjacent-only | Peephole (DAG) | Full (hybrid) | Reduction | 2-qubit | Blocks | Equivalent | ESP | Simulated success |
|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|---:|---:|
| basics | 3 | 15 | 9 | 7 | 7 | 53% | 3 → 1 | 1 → 1 | ✓ | 86.5% → 93.0% | 95.4% → 95.2% |
| adder | 11 | 30 | 30 | 30 | 3 | 90% | 25 → 0 | 3 → 1 | ✓ | 38.8% → 93.6% | 58.7% → 93.4% |
| adder-superposition | 11 | 30 | 30 | 30 | 21 | 30% | 25 → 17 | 3 → 1 | ✓ | 38.8% → 52.6% | 70.2% → 81.7% |
| grover | 3 | 43 | 35 | 33 | 33 | 23% | 4 → 4 | 1 → 1 | ✓ | 74.9% → 76.4% | 91.4% → 91.7% |
| teleport | 3 | 8 | 8 | 8 | 8 | 0% | 2 → 2 | 5 → 5 | ✓ | 90.2% → 90.2% | 94.2% → 94.2% |
| adder-3bit | 8 | 23 | 23 | 23 | 4 | 83% | 19 → 0 | 1 → 1 | ✓ | 49.0% → 95.3% | 65.5% → 95.3% |
| adder-3bit-superposed | 8 | 23 | 23 | 23 | 17 | 26% | 19 → 13 | 1 → 1 | ✓ | 49.0% → 60.6% | 80.9% → 87.9% |
| adder-5bit | 12 | 37 | 37 | 37 | 6 | 84% | 31 → 0 | 1 → 1 | ✓ | 31.3% → 93.0% | 52.2% → 93.8% |
| adder-5bit-superposed | 12 | 37 | 37 | 37 | 31 | 16% | 31 → 25 | 1 → 1 | ✓ | 31.3% → 38.7% | 79.3% → 87.1% |
| adder-7bit | 16 | 51 | 51 | 51 | 8 | 84% | 43 → 0 | 1 → 1 | ✓ | 20.0% → 90.8% | 40.7% → 91.8% |
| adder-7bit-superposed | 16 | 51 | 51 | 51 | 45 | 12% | 43 → 37 | 1 → 1 | ✓ | 20.0% → 24.8% | — |
| qft-roundtrip-3 | 3 | 38 | 36 | 32 | 27 | 29% | 12 → 2 | 1 → 1 | ✓ | 64.1% → 86.9% | 74.4% → 89.4% |
| qft-roundtrip-4 | 4 | 70 | 68 | 60 | 27 | 61% | 24 → 2 | 1 → 1 | ✓ | 42.4% → 86.0% | 57.0% → 89.2% |
| qft-roundtrip-5 | 5 | 113 | 111 | 97 | 78 | 31% | 40 → 12 | 1 → 1 | ✓ | 24.5% → 58.0% | 41.4% → 68.8% |
| random-4q-100g | 4 | 121 | 91 | 79 | 70 | 42% | 63 → 35 | 1 → 1 | ✓ | 8.7% → 25.5% | 91.0% → 94.3% |
| random-dyn-4q-100g | 4 | 114 | 96 | 77 | 68 | 40% | 48 → 33 | 9 → 9 | ✓ | 14.5% → 24.3% | 95.5% → 96.9% |
| random-6q-200g | 6 | 253 | 189 | 149 | 134 | 47% | 108 → 64 | 1 → 1 | ✓ | 1.5% → 8.7% | — |
| random-dyn-6q-200g | 6 | 232 | 166 | 126 | 103 | 56% | 76 → 35 | 11 → 11 | — | 5.4% → 25.0% | — |
| random-8q-400g | 8 | 518 | 372 | 304 | 288 | 44% | 250 → 130 | 1 → 1 | ✓ | 0.0% → 0.7% | — |
| random-dyn-8q-400g | 8 | 465 | 335 | 268 | 226 | 51% | 171 → 77 | 27 → 27 | — | 0.1% → 3.9% | — |
| random-10q-800g | 10 | 1058 | 754 | 573 | 536 | 49% | 461 → 267 | 1 → 1 | ✓ | 0.0% → 0.0% | — |
| random-dyn-10q-800g | 10 | 956 | 694 | 532 | 478 | 50% | 353 → 194 | 43 → 43 | — | 0.0% → 0.1% | — |
