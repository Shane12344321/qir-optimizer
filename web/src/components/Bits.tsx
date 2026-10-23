import type { ReactNode } from 'react';

/**
 * A numbered section: reading column plus a margin for citations and presenter notes.
 * `wide` sections give the column the full width (for large live figures) and set the
 * margin notes as a row underneath instead.
 */
export function Section({ id, num, title, side, wide, children }: { id: string; num: string; title: string; side?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`section${wide ? ' wide' : ''}`} id={id} data-section aria-labelledby={`${id}-h`}>
      <div className="runhead" aria-hidden="true"><span>A Hybrid-Aware, Self-Verifying Optimizer for QIR</span><span>§{num} · {title}</span></div>
      <div className="col">
        <div className="sec-head">
          <span className="num">§{num}</span>
          <h2 id={`${id}-h`}>{title}</h2>
        </div>
        {children}
      </div>
      {side && <aside className="side">{side}</aside>}
    </section>
  );
}

/** Margin note for presenters: what to say. Hidden in audience mode. */
export function Say({ children }: { children: ReactNode }) {
  return (
    <div className="note say">
      <span className="runin">Presenter.</span>
      {children}
    </div>
  );
}

/** Likely viva question with a prepared answer. Hidden in audience mode. */
export function Viva({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="note viva">
      <p><span className="runin" style={{ float: 'none' }}>Viva.</span><strong>{q}</strong></p>
      {children}
    </div>
  );
}

export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="note">
      <span className="runin">{title}.</span>
      {children}
    </div>
  );
}

export function Figure({ n, caption, children }: { n: string; caption: ReactNode; children: ReactNode }) {
  return (
    <figure className="figure">
      {children}
      <figcaption className="caption"><b>Figure {n}.</b>{caption}</figcaption>
    </figure>
  );
}

/** A numbered table caption, set above the table as in proceedings. */
export function TableCap({ n, children }: { n: number; children: ReactNode }) {
  return <p className="tcap"><b>Table {n}.</b>{children}</p>;
}

export function Bars({ rows, max, tone }: { rows: { label: string; value: number; tone?: 'acc' | 'bad' }[]; max?: number; tone?: 'acc' | 'bad' }) {
  const top = max ?? Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="row" key={r.label}>
          <span>{r.label}</span>
          <span className="track"><span className={`fill ${r.tone ?? tone ?? ''}`} style={{ width: `${(r.value / top) * 100}%` }} /></span>
          <span className="v">{(r.value * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}
