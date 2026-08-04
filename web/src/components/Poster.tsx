const PALETTES: [string, string][] = [
  ['#7c5cff', '#22d3ee'],
  ['#f472b6', '#7c5cff'],
  ['#34d399', '#22d3ee'],
  ['#fbbf24', '#fb7185'],
  ['#60a5fa', '#a78bfa'],
  ['#f97316', '#eab308'],
  ['#2dd4bf', '#3b82f6'],
];

function pick(seed: string): [string, string] {
  let hash = 0;
  for (let index = 0; index < seed.length; index++) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

export default function Poster({
  seed,
  title,
  size = 'grid',
}: {
  seed: string;
  title: string | null;
  size?: 'grid' | 'detail' | 'thumb';
}) {
  const [a, b] = pick(seed);
  const initial = (title ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={`poster poster-${size}`}
      style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
      aria-hidden="true"
    >
      <span className="poster-initial">{initial}</span>
    </div>
  );
}
