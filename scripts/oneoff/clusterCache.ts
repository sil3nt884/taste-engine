import { pool, query } from '../../src/db.js';

const threshold = Number(process.argv[2]) || 0.9;

function cosine(left: number[], right: number[]): number {
  let dot = 0, leftNorm = 0, rightNorm = 0;
  for (let dim = 0; dim < left.length; dim++) {
    dot += left[dim]! * right[dim]!;
    leftNorm += left[dim]! * left[dim]!;
    rightNorm += right[dim]! * right[dim]!;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm) || 1);
}

async function main(): Promise<void> {
  const rows = await query<{ extraction: { positive?: { slug: string }[] }; embedding: string; hits: number }>(
    `SELECT extraction, mood_embedding::text AS embedding, hits
       FROM query_cache
      WHERE mood_embedding IS NOT NULL
      ORDER BY hits DESC`,
  );
  if (rows.length === 0) {
    console.log('No cache rows with a mood centroid. Run `npm run moods:embed` first.');
    return;
  }

  const items = rows.map((row) => ({
    slugs: (row.extraction.positive ?? []).map((term) => term.slug),
    vec: JSON.parse(row.embedding) as number[],
    hits: row.hits,
  }));

  const clusters: number[][] = [];
  const seen = new Set<number>();
  for (let seedIndex = 0; seedIndex < items.length; seedIndex++) {
    if (seen.has(seedIndex)) continue;
    const group = [seedIndex];
    seen.add(seedIndex);
    for (let candidateIndex = seedIndex + 1; candidateIndex < items.length; candidateIndex++) {
      if (seen.has(candidateIndex)) continue;
      if (cosine(items[seedIndex]!.vec, items[candidateIndex]!.vec) >= threshold) {
        group.push(candidateIndex);
        seen.add(candidateIndex);
      }
    }
    clusters.push(group);
  }

  console.log(`${items.length} cached queries → ${clusters.length} feel-cluster(s) at cosine >= ${threshold}\n`);
  clusters
    .sort((left, right) => right.length - left.length)
    .forEach((group, idx) => {
      console.log(`Cluster ${idx + 1}  (${group.length} entr${group.length === 1 ? 'y' : 'ies'})`);
      for (const memberIndex of group) {
        const item = items[memberIndex]!;
        console.log(`   [${item.slugs.join(', ') || '—'}]  ·  ${item.hits} hit(s)`);
      }
      console.log('');
    });
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
