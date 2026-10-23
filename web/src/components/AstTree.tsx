// The parser's syntax tree drawn as an actual tree: root on the left, children to the right.

import type { Expr, Stmt } from '@core';

interface Node { label: string; kind: 'root' | 'stmt' | 'leaf'; children: Node[] }

const arg = (a: { reg: string; index?: number }) => (a.index === undefined ? a.reg : `${a.reg}[${a.index}]`);
function ex(e: Expr): string {
  switch (e.kind) {
    case 'num': return String(e.value);
    case 'pi': return 'π';
    case 'id': return e.name;
    case 'unary': return `−${ex(e.arg)}`;
    case 'binary': return `${ex(e.left)}${e.op}${ex(e.right)}`;
    case 'call': return `${e.fn}(${ex(e.arg)})`;
  }
}
const leaf = (label: string): Node => ({ label, kind: 'leaf', children: [] });

function toNode(s: Stmt): Node {
  switch (s.kind) {
    case 'version': return { label: 'Version', kind: 'stmt', children: [leaf(s.version)] };
    case 'include': return { label: 'Include', kind: 'stmt', children: [leaf(`"${s.file}"`)] };
    case 'qreg': case 'creg': return { label: s.kind === 'qreg' ? 'QReg' : 'CReg', kind: 'stmt', children: [leaf(`${s.name}[${s.size}]`)] };
    case 'call': return { label: `Call ${s.name}`, kind: 'stmt', children: [...s.params.map((p) => leaf(ex(p))), ...s.args.map((a) => leaf(arg(a)))] };
    case 'measure': return { label: 'Measure', kind: 'stmt', children: [leaf(arg(s.q)), leaf(`→ ${arg(s.c)}`)] };
    case 'reset': return { label: 'Reset', kind: 'stmt', children: [leaf(arg(s.q))] };
    case 'barrier': return { label: 'Barrier', kind: 'stmt', children: s.args.map((a) => leaf(arg(a))) };
    case 'if': return { label: `If ${s.creg} == ${s.value}`, kind: 'stmt', children: [toNode(s.body)] };
    case 'gatedef': return { label: `Gate ${s.name}`, kind: 'stmt', children: s.body.map((b) => toNode(b)) };
  }
}

interface Placed { node: Node; x: number; y: number; kids: Placed[] }

export function AstTree({ stmts }: { stmts: Stmt[] }) {
  const root: Node = { label: 'Program', kind: 'root', children: stmts.map(toNode) };
  const ROW = 30, COLW = [120, 150, 110, 90];
  const colX = (d: number) => 10 + COLW.slice(0, d).reduce((a, b) => a + b, 0);
  let row = 0;
  const place = (n: Node, d: number): Placed => {
    if (!n.children.length) return { node: n, x: colX(d), y: row++ * ROW + 20, kids: [] };
    const kids = n.children.map((c) => place(c, d + 1));
    return { node: n, x: colX(d), y: (kids[0].y + kids[kids.length - 1].y) / 2, kids };
  };
  // Leaves of one statement share a row band; keep the tree compact by laying args side by side.
  const placeStmt = (n: Node, d: number): Placed => {
    if (n.kind === 'stmt' && n.children.every((c) => c.kind === 'leaf')) {
      const y = row++ * ROW + 20;
      let x = colX(d + 1);
      const kids = n.children.map((c) => { const p = { node: c, x, y, kids: [] }; x += Math.max(56, c.label.length * 8 + 22); return p; });
      return { node: n, x: colX(d), y, kids };
    }
    if (!n.children.length) return place(n, d);
    const kids = n.children.map((c) => placeStmt(c, d + 1));
    return { node: n, x: colX(d), y: (kids[0].y + kids[kids.length - 1].y) / 2, kids };
  };
  const tree = placeStmt(root, 0);
  const all: Placed[] = [];
  const walk = (p: Placed) => { all.push(p); p.kids.forEach(walk); };
  walk(tree);
  const w = (p: Placed) => Math.max(44, p.node.label.length * 7.6 + 18);
  const W = Math.max(...all.map((p) => p.x + w(p))) + 10;
  const H = row * ROW + 10;
  const edges: [Placed, Placed][] = [];
  all.forEach((p) => p.kids.forEach((k, i) => {
    // Operands sit side by side: link each to the previous one so the row reads left to right.
    edges.push([i > 0 && k.y === p.kids[i - 1].y ? p.kids[i - 1] : p, k]);
  }));
  return (
    <div className="circuit" style={{ maxHeight: 420, overflowY: 'auto', padding: '8px 10px' }}>
      <svg width={W} height={H} role="img" aria-label="Abstract syntax tree">
        {edges.map(([a, b], i) => {
          const x1 = a.x + w(a), x2 = b.x, mx = (x1 + x2) / 2;
          return <path key={i} d={`M${x1} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${x2} ${b.y}`} fill="none" stroke="var(--ink-3)" strokeWidth={1} />;
        })}
        {all.map((p, i) => (
          <g key={i}>
            <rect x={p.x} y={p.y - 11} width={w(p)} height={22} rx={p.node.kind === 'leaf' ? 11 : 2}
              fill={p.node.kind === 'root' ? 'var(--ink)' : p.node.kind === 'leaf' ? 'var(--rule-2)' : 'var(--plate)'}
              stroke={p.node.kind === 'leaf' ? 'var(--rule)' : 'var(--ink)'} />
            <text x={p.x + w(p) / 2} y={p.y + 4.5} textAnchor="middle" fontSize={12.5}
              fontFamily={p.node.kind === 'leaf' ? 'var(--mono)' : 'var(--label)'} fontWeight={p.node.kind === 'leaf' ? 400 : 700}
              fill={p.node.kind === 'root' ? 'var(--plate)' : 'var(--ink)'}>{p.node.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
