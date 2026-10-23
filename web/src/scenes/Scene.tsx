import type { ReactNode } from 'react';

export interface Point {
  /** Short lead in bold, then an optional continuation. */
  lead: string;
  rest?: ReactNode;
}

interface Props {
  id: string;
  n: number;
  title: ReactNode;
  points?: Point[];
  /** 'split': words left, figure right. 'full': words on top, figure across the width. */
  layout?: 'split' | 'full';
  notes?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** One screen of the presentation: a heading, a few big points and a live figure. */
export function Scene({ id, n, title, points, layout = 'split', notes, children, className }: Props) {
  return (
    <section id={id} className={`scene ${layout}${className ? ` ${className}` : ''}`} data-scene data-n={n} aria-labelledby={`${id}-t`}>
      <div className="scene-words">
        <h2 id={`${id}-t`} className="scene-title">{title}</h2>
        {points && points.length > 0 && (
          <ul className="points">
            {points.map((p, i) => (
              <li key={i}><strong>{p.lead}</strong>{p.rest && <> {p.rest}</>}</li>
            ))}
          </ul>
        )}
      </div>
      {children && <div className="scene-figure">{children}</div>}
      {notes && <aside className="scene-notes" aria-label="Speaker notes">{notes}</aside>}
    </section>
  );
}

export function Say({ children }: { children: ReactNode }) {
  return <div className="sn say"><span className="sn-h">Say</span><div>{children}</div></div>;
}

export function IfAsked({ q, children }: { q: string; children: ReactNode }) {
  return <div className="sn ask"><span className="sn-h">If asked</span><div><strong>{q}</strong> {children}</div></div>;
}
