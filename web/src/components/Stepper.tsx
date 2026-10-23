// Step-through replay of the optimizer: every rewrite is a frame; the circuit,
// the QIR text and the explanation stay in sync.

import { useEffect, useMemo, useState } from 'react';
import { BLOCK_REASONS, emitModule, RULES, type RewriteEvent } from '@core';
import { rowKeys, layoutCircuit } from '../lib/circuit';
import type { RunOk } from '../lib/run';
import { Circuit, type Marks } from './Circuit';
import { CodeView, type LineMark } from './CodeView';
import { Icon } from './Icon';

interface Props {
  run: RunOk;
  /** Show the QIR text pane next to the circuit. */
  showCode?: boolean;
  /** Start on the final frame instead of the first. */
  startAtEnd?: boolean;
  autoplay?: boolean;
  codeHeight?: number;
  title?: string;
  colW?: number;
  rowH?: number;
}

export function Stepper({ run, showCode = true, startAtEnd = false, autoplay = false, codeHeight = 360, title, colW, rowH }: Props) {
  const { result, input } = run;
  const events = result.snapshots.map((s) => s.event);
  // Frames: 0 = input; k in 1..n = just before rewrite k (highlighted); n + 1 = final output.
  const n = events.length;
  const last = n + 1;
  const [step, setStep] = useState(startAtEnd ? last : 0);
  const [playing, setPlaying] = useState(autoplay);

  useEffect(() => {
    setStep(startAtEnd ? n + 1 : 0);
    setPlaying(autoplay);
  }, [run, n, startAtEnd, autoplay]);

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => Math.min(last, s + 1)), step === 0 ? 600 : 1150);
    return () => clearTimeout(t);
  }, [playing, step, last]);

  const rows = useMemo(() => rowKeys(input), [input]);
  const minCols = useMemo(() => layoutCircuit(input, rows).cols, [input, rows]);
  const moduleAt = (k: number) => (k <= 1 ? input : result.snapshots[Math.min(k, n + 1) - 2].module);
  const textAt = (k: number) => (k <= 1 ? result.inputText : result.snapshots[Math.min(k, n + 1) - 2].text);
  const frameModule = n === 0 ? input : moduleAt(step);
  const frameText = n === 0 ? result.inputText : textAt(step);
  const ev: RewriteEvent | undefined = step >= 1 && step <= n ? events[step - 1] : undefined;

  const atEnd = step >= last || n === 0;
  const marks: Marks = useMemo(() => {
    if (ev) return { removed: new Set(ev.removed), changed: new Set(ev.changed) };
    // On the final frame, bracket the pairs the optimizer refused, and the instruction that blocked each.
    if (atEnd) {
      return {
        refused: new Set(result.refusals.flatMap((r) => r.ids)),
        blocker: new Set(result.refusals.map((r) => r.blocker).filter((x): x is number => x !== undefined)),
      };
    }
    return {};
  }, [ev, atEnd, result]);
  const finalLines = useMemo(() => emitModule(result.module).lineOf, [result]);
  const lineMarks = useMemo(() => {
    const m = new Map<number, LineMark>();
    if (atEnd && n > 0) {
      for (const r of result.refusals) for (const id of r.ids) { const l = finalLines.get(id); if (l) m.set(l, 'ref'); }
      return m;
    }
    if (ev) for (const l of ev.linesBefore ?? []) m.set(l, ev.removed.length && !ev.changed.length ? 'gone' : 'hi');
    if (ev?.rule === 'remove-unreachable') for (const l of ev.linesBefore ?? []) m.set(l, 'gone');
    return m;
  }, [ev, atEnd, n, result, finalLines]);

  const gatesNow = countGates(frameModule);
  const blocksNow = frameModule.functions.reduce((s, f) => s + f.blocks.length, 0);
  const info = ev ? RULES[ev.rule] : undefined;

  return (
    <div className="plate">
      <div className="plate-bar">
        {title && <strong style={{ fontWeight: 700 }}>{title}</strong>}
        <span className="grow" />
        <span>gates <b>{result.before.gates}</b> → <b style={{ color: 'var(--accent-ink)' }}>{gatesNow}</b></span>
        <span>blocks <b>{result.before.blocks}</b> → <b>{blocksNow}</b></span>
        <span>{step === 0 ? 'input' : step > n ? <><b>{n}</b> rewrites applied</> : <>applying <b>{step}</b> of {n}</>}</span>
        {result.validation && (
          <span className={`tag ${result.validation.equivalent ? 'ok' : 'bad'}`}>{result.validation.equivalent ? 'proven equivalent' : 'NOT equivalent'}</span>
        )}
      </div>
      <div className="timeline">
        <button className="btn" onClick={() => { setPlaying(false); setStep(0); }} disabled={step === 0} aria-label="First step"><Icon name="first" /></button>
        <button className="btn" onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} disabled={step === 0} aria-label="Previous step"><Icon name="prev" /></button>
        <button className="btn primary" onClick={() => { if (step >= last) setStep(0); setPlaying((p) => !p); }} disabled={n === 0} style={{ minWidth: 92 }}>
          <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}><Icon name={playing ? 'pause' : 'play'} size={12} />{playing ? 'Pause' : step >= last && n > 0 ? 'Replay' : 'Play'}</span>
        </button>
        <button className="btn" onClick={() => { setPlaying(false); setStep((s) => Math.min(last, s + 1)); }} disabled={step >= last} aria-label="Next step"><Icon name="next" /></button>
        <input type="range" min={0} max={last} value={step} onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }} aria-label="Rewrite step" />
        <button className="btn" onClick={() => { setPlaying(false); setStep(last); }} disabled={step >= last} aria-label="Last step"><Icon name="last" /></button>
      </div>
      <div className="event" aria-live="polite">
        {ev && info ? (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span className="rule">{info.title}</span>
              <span className="concept">{info.concept}</span>
              <span className="grow" style={{ flex: 1 }} />
              {ev.validated && <span className={`tag ${ev.validated.equivalent ? 'ok' : 'bad'}`}>{ev.validated.equivalent ? `validated · F = ${ev.validated.fidelity.toFixed(6)}` : 'invalid'}</span>}
            </div>
            <p>{ev.message}</p>
          </>
        ) : step >= last || (n === 0 && step > 0) ? (
          <>
            <span className="rule">Fixed point reached</span>
            <p>
              {n === 0 ? 'No rewrite applies to this program. ' : `${n} rewrites in ${result.iterations - 1 || 1} pass iteration${result.iterations > 2 ? 's' : ''}. `}
              {result.refusals.length > 0 && `${result.refusals.length} candidate rewrite${result.refusals.length > 1 ? 's were' : ' was'} refused: ${BLOCK_REASONS[result.refusals[0].reason]}${result.refusals.length > 1 ? ', …' : '.'}`}
              {result.validation?.equivalent && ` Input and output proven equivalent (${result.validation.branches} branch${result.validation.branches > 1 ? 'es' : ''}).`}
            </p>
          </>
        ) : (
          <>
            <span className="rule">Input program</span>
            <p>Press Play to replay the optimizer one rewrite at a time, or step with the arrows.</p>
          </>
        )}
      </div>
      <div className="plate-body" style={{ paddingBottom: 6 }}>
        <Circuit module={frameModule} marks={marks} rowOrder={rows} minCols={minCols} colW={colW} rowH={rowH} />
      </div>
      {showCode && (
        <div style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="pane-h"><span>QIR · {step === 0 ? 'input' : step >= last ? 'output' : `before rewrite ${step}`}</span><span>{frameText.split('\n').length} lines</span></div>
          <CodeView text={frameText} marks={lineMarks} maxHeight={codeHeight} label="QIR text for this step" />
        </div>
      )}
    </div>
  );
}

function countGates(m: RunOk['input']): number {
  let k = 0;
  for (const f of m.functions) for (const b of f.blocks) for (const i of b.instrs) if (i.op === 'gate') k++;
  return k;
}
