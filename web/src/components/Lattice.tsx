// Hasse diagram of the per-qubit constant-propagation lattice, in plain words.

export function Lattice() {
  const node = (x: number, y: number, label: string, sub: string) => (
    <g>
      <rect x={x - 58} y={y - 18} width={116} height={36} fill="var(--plate)" stroke="var(--ink)" strokeWidth={1.3} />
      <text x={x} y={y + 5} textAnchor="middle" fontSize={15} fontFamily="var(--serif)" fontWeight={600}>{label}</text>
      <text x={x} y={y + 34} textAnchor="middle" fontSize={11.5} fontFamily="var(--label)" fill="var(--ink-3)">{sub}</text>
    </g>
  );
  return (
    <svg width="100%" viewBox="0 0 420 250" role="img" aria-label="Lattice: not reached, below definitely 0 and definitely 1, both below unknown">
      <line x1={210} y1={48} x2={120} y2={110} stroke="var(--ink)" />
      <line x1={210} y1={48} x2={300} y2={110} stroke="var(--ink)" />
      <line x1={120} y1={134} x2={210} y2={196} stroke="var(--ink)" />
      <line x1={300} y1={134} x2={210} y2={196} stroke="var(--ink)" />
      {node(210, 30, 'unknown', '')}
      {node(120, 120, 'definitely 0', '')}
      {node(300, 120, 'definitely 1', '')}
      {node(210, 210, 'not reached', '')}
    </svg>
  );
}
