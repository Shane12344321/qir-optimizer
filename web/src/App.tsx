import { useEffect, useState } from 'react';
import { SCENES } from './scenes';
import { SECTIONS } from './sections';

function readStored(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

export function App() {
  const [current, setCurrent] = useState(SCENES[0].id);
  const [notes, setNotes] = useState(() => readStored('qir-notes', true));
  const [appendix, setAppendix] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('audience', !notes);
    try {
      localStorage.setItem('qir-notes', notes ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }, [notes]);

  // Track the scene in view for the progress rail.
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('[data-scene], [data-section]')];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: '-35% 0px -60% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [appendix]);

  // Presentation keys: → / Space / PageDown next scene, ← / PageUp previous, N toggles speaker notes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('textarea, input, select, [contenteditable]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Work out the current scene from the scroll position at key time, not from observer state,
      // so fast repeated presses never skip or repeat a scene.
      const tops = SCENES.map((s) => document.getElementById(s.id)?.getBoundingClientRect().top ?? Infinity);
      let idx = -1;
      tops.forEach((t, i) => { if (t <= 60) idx = i; });
      if (tops[SCENES.length - 1] < -window.innerHeight) idx = SCENES.length; // in the appendix
      const go = (k: number) => {
        const s = SCENES[Math.max(0, Math.min(SCENES.length - 1, k))];
        document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      const next = ['ArrowRight', 'PageDown', ' ', ']'].includes(e.key);
      const prev = ['ArrowLeft', 'PageUp', '['].includes(e.key);
      if ((next || prev) && t.closest('button') && e.key === ' ') return;
      if (next) { e.preventDefault(); go(idx + 1); }
      if (prev) { e.preventDefault(); go(idx - 1); }
      if (e.key === 'n' || e.key === 'N') setNotes((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const idx = SCENES.findIndex((s) => s.id === current);

  return (
    <div className="shell">
      <nav className="rail" aria-label="Scenes">
        <div className="rail-title">QIR Optimizer<span>BCSE307 · Review 3</span></div>
        <ol className="toc">
          {SCENES.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} aria-current={current === s.id ? 'true' : undefined}>
                <span className="n">{i + 1}</span>
                <span>{s.short}</span>
              </a>
            </li>
          ))}
          <li><a href="#appendix" aria-current={current.startsWith('s-') ? undefined : 'true'} onClick={() => setAppendix(true)}><span className="n">A</span><span>Appendix</span></a></li>
        </ol>
        <details className="toc-mobile">
          <summary>Scenes</summary>
          <ol>{SCENES.map((s, i) => <li key={s.id}><a href={`#${s.id}`}>{i + 1}. {s.short}</a></li>)}</ol>
        </details>
        <div className="rail-foot">
          <div className="progress" aria-hidden="true"><span style={{ width: `${idx < 0 ? 100 : ((idx + 1) / SCENES.length) * 100}%` }} /></div>
          <button className="toggle" aria-pressed={notes} onClick={() => setNotes((v) => !v)}>
            Speaker notes <kbd>N</kbd>
          </button>
          <span className="kbd-hint"><kbd>←</kbd> <kbd>→</kbd> move between scenes. Every figure is live.</span>
        </div>
      </nav>
      <main className="doc">
        {SCENES.map((s) => <s.Component key={s.id} />)}
        <section id="appendix" className="appendix-head">
          <h2>Appendix: the full technical write-up</h2>
          <p>Everything above in detail: architecture, algorithms, the related-work survey, every benchmark, the test list, viva answers and references. Use it for preparation and questions.</p>
          <button className="btn primary" aria-expanded={appendix} onClick={() => setAppendix((a) => !a)}>{appendix ? 'Hide the write-up' : 'Show the write-up'}</button>
        </section>
        {appendix && SECTIONS.map((s) => <s.Component key={s.id} />)}
      </main>
    </div>
  );
}
