import type { ComponentType } from 'react';
import { Abstract, Problem, Qir, Quantum } from './front';
import { Frontend, Hybrid, Peephole, System, Validation } from './method';
import { Evaluation, Lab, Limits, Related, Team } from './results';

export interface SectionEntry {
  id: string;
  num: string;
  short: string;
  Component: ComponentType;
}

export const SECTIONS: SectionEntry[] = [
  { id: 'abstract', num: '0', short: 'Abstract', Component: Abstract },
  { id: 'problem', num: '1', short: 'Every gate costs accuracy', Component: Problem },
  { id: 'quantum', num: '2', short: 'Quantum basics', Component: Quantum },
  { id: 'qir', num: '3', short: 'QIR as LLVM IR', Component: Qir },
  { id: 'system', num: '4', short: 'Architecture', Component: System },
  { id: 'frontend', num: '5', short: 'Front-end', Component: Frontend },
  { id: 'peephole', num: '6', short: 'Peephole along wires', Component: Peephole },
  { id: 'hybrid', num: '7', short: 'Hybrid constant propagation', Component: Hybrid },
  { id: 'validation', num: '8', short: 'Translation validation', Component: Validation },
  { id: 'related', num: '9', short: 'Related work', Component: Related },
  { id: 'eval', num: '10', short: 'Evaluation', Component: Evaluation },
  { id: 'lab', num: '11', short: 'Laboratory', Component: Lab },
  { id: 'limits', num: '12', short: 'Limitations', Component: Limits },
  { id: 'team', num: '13', short: 'Demo and viva', Component: Team },
];
