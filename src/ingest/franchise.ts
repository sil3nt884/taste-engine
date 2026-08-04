import { query } from '../db.js';
import type { RelationEdge, FranchiseRow } from '../types';

const CHAIN = new Set(['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SUMMARY']);
const CHILD = new Set(['PREQUEL', 'PARENT']);
const TV_LIKE = new Set(['TV', 'TV_SHORT']);

export function resolveFranchises(
  nodes: number[], edges: RelationEdge[], formats?: Map<number, string | null>,
): Map<number, number[]> {
  const parent = new Map<number, number>(nodes.map((node) => [node, node]));
  const find = (node: number): number => {
    const parentOf = parent.get(node)!;
    if (parentOf === node) return node;
    const root = find(parentOf);
    parent.set(node, root);
    return root;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left), rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(leftRoot, rightRoot);
  };
  const nonTv = (node: number): boolean => {
    const format = formats?.get(node);
    return format != null && !TV_LIKE.has(format);
  };

  const present = new Set(nodes);
  for (const edge of edges) {
    if (!present.has(edge.from) || !present.has(edge.to)) continue;
    if (CHAIN.has(edge.type)) union(edge.from, edge.to);
    else if (edge.type === 'ALTERNATIVE' && (nonTv(edge.from) || nonTv(edge.to))) union(edge.from, edge.to);
  }

  const groups = new Map<number, number[]>();
  for (const node of nodes) {
    const root = find(node);
    const members = groups.get(root);
    if (members) members.push(node); else groups.set(root, [node]);
  }
  return groups;
}

export function findEntryPoints(nodes: number[], edges: RelationEdge[]): number[] {
  const present = new Set(nodes);
  const isChild = new Set<number>();
  for (const edge of edges) {
    if (CHILD.has(edge.type) && present.has(edge.from) && present.has(edge.to)) isChild.add(edge.from);
  }
  const entries = nodes.filter((node) => !isChild.has(node));
  return entries.length ? entries : [...nodes];
}

export async function resolveFranchiseRoots(): Promise<{ titles: number; franchises: number }> {
  const media = await query<FranchiseRow>(
    `SELECT id, anilist_id, season_year, popularity, format FROM media`,
  );
  const byAnilist = new Map<number, FranchiseRow>(media.map((row) => [row.anilist_id, row]));
  const nodes = media.map((row) => row.anilist_id);
  const formats = new Map<number, string | null>(media.map((row) => [row.anilist_id, row.format]));

  const rawEdges = await query<{ from: number; to: number; type: string }>(
    `SELECT from_anilist_id AS "from", to_anilist_id AS "to", relation_type AS type
       FROM media_relation`,
  );
  const edges = rawEdges.filter((edge) => byAnilist.has(edge.from) && byAnilist.has(edge.to));

  const components = resolveFranchises(nodes, edges, formats);

  const ids: string[] = [];
  const roots: string[] = [];
  for (const members of components.values()) {
    const pool = findEntryPoints(members, edges);
    const rootAnilist = pool.slice().sort((left, right) => {
      const leftPopularity = byAnilist.get(left)!.popularity ?? -1;
      const rightPopularity = byAnilist.get(right)!.popularity ?? -1;
      if (rightPopularity !== leftPopularity) return rightPopularity - leftPopularity;
      const leftYear = byAnilist.get(left)!.season_year ?? 99_999;
      const rightYear = byAnilist.get(right)!.season_year ?? 99_999;
      return leftYear - rightYear || left - right;
    })[0]!;
    const rootId = byAnilist.get(rootAnilist)!.id;
    for (const anilistId of members) {
      ids.push(byAnilist.get(anilistId)!.id);
      roots.push(rootId);
    }
  }

  await query(
    `UPDATE media m SET franchise_root_id = data.root
       FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::bigint[]) AS root) data
      WHERE m.id = data.id`,
    [ids, roots],
  );

  return { titles: media.length, franchises: components.size };
}
