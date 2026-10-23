// A small authored icon set: one 16px grid, 1.6px stroke, square caps.

const PATHS: Record<string, string> = {
  first: 'M4 3v10M13 3 7 8l6 5',
  prev: 'M10.5 3 5.5 8l5 5',
  next: 'M5.5 3l5 5-5 5',
  last: 'M12 3v10M3 3l6 5-6 5',
  play: 'M5 3.5v9l7-4.5z',
  pause: 'M5.5 3.5v9M10.5 3.5v9',
  check: 'M3 8.5 6.5 12 13 4.5',
  cross: 'M4 4l8 8M12 4l-8 8',
  run: 'M3 8h9M8.5 4.5 12 8l-3.5 3.5',
};

export function Icon({ name, size = 14, title }: { name: keyof typeof PATHS | string; size?: number; title?: string }) {
  const filled = name === 'play';
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} style={{ display: 'block' }}>
      {title && <title>{title}</title>}
      <path d={PATHS[name]} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.6} strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}
