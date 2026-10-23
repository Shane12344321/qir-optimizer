import { useEffect, useMemo, useRef, type ReactNode } from 'react';

export type LineMark = 'hi' | 'gone' | 'ref' | 'err';

interface Props {
  text: string;
  lang?: 'qir' | 'qasm';
  marks?: Map<number, LineMark>;
  maxHeight?: number;
  /** Scroll the first marked line into view when marks change. */
  follow?: boolean;
  label?: string;
}

const QIR_RE = /(;.*$)|("(?:[^"\\]|\\.)*")|(@[-\w.$]+)|(%[-\w.$]+)|(\b(?:define|declare|call|br|ret|label|attributes|type|opaque|zext|shl|or|and|xor|icmp|eq|ne|to|inttoptr|writeonly|true|false|null|source_filename)\b)|(\b(?:ptr|void|i1|i64|i32|i8|double)\b)|(-?\b0x[0-9A-F]+\b|-?\b\d+(?:\.\d+)?(?:e[-+]?\d+)?\b)|(^[-\w.]+:)/g;
const QASM_RE = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|(\b(?:OPENQASM|include|qreg|creg|gate|measure|reset|barrier|if|opaque)\b)|(\bpi\b)|(-?\b\d+(?:\.\d+)?\b)|(->|==)/g;

function highlight(line: string, lang: 'qir' | 'qasm'): ReactNode[] {
  const re = new RegExp(lang === 'qir' ? QIR_RE : QASM_RE);
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    let cls = '';
    if (lang === 'qir') {
      cls = m[1] ? 't-com' : m[2] ? 't-str' : m[3] ? 't-fn' : m[4] ? 't-var' : m[5] ? 't-kw' : m[6] ? 't-kw' : m[7] ? 't-num' : m[8] ? 't-lbl' : '';
    } else {
      cls = m[1] ? 't-com' : m[2] ? 't-str' : m[3] ? 't-kw' : m[4] ? 't-num' : m[5] ? 't-num' : m[6] ? 't-kw' : '';
    }
    out.push(<span key={k++} className={cls}>{m[0]}</span>);
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function CodeView({ text, lang = 'qir', marks, maxHeight = 420, follow = true, label }: Props) {
  const lines = useMemo(() => text.replace(/\n$/, '').split('\n'), [text]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!follow || !marks?.size || !ref.current) return;
    const first = Math.min(...marks.keys());
    const el = ref.current.querySelector<HTMLElement>(`[data-ln="${first}"]`);
    if (el) {
      const box = ref.current;
      const target = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - box.clientHeight / 3;
      box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
  }, [marks, follow]);
  return (
    <div className="codeview" ref={ref} style={{ maxHeight }} aria-label={label} tabIndex={0}>
      {lines.map((l, i) => (
        <div key={i} data-ln={i + 1} className={`ln ${marks?.get(i + 1) ?? ''}`}>
          <span>{i + 1}</span>
          <span>{highlight(l, lang)}</span>
        </div>
      ))}
    </div>
  );
}
