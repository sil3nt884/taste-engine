import { createHash } from 'node:crypto';
import { config, EMBED_MODEL_ID } from '../config.js';
import { query } from '../db.js';
import type {EmbedRow, EmbedCounters} from "../types";
import {CHUNK_CHARS, OLLAMA_HOST} from "../consts";
import { ollamaHeaders } from './ollama.js';

export async function embed(text: string, signal?: AbortSignal): Promise<number[]> {
  const res = await fetch(OLLAMA_HOST, {
    method: 'POST',
    headers: ollamaHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ model: config.EMBED_MODEL, prompt: text }),
    signal,
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  const body = await res.json() as { embedding?: number[] };
  if (!body.embedding?.length) throw new Error('embed: empty response');
  return body.embedding;
}

export const asDocument = (text: string): string => text;
export const asQuery = (text: string): string =>
  `Represent this sentence for searching relevant passages: ${text}`;
export const toVector = (vector: number[]): string => `[${vector.join(',')}]`;

export async function embedQuery(text: string, signal?: AbortSignal): Promise<string> {
  return toVector(await embed(asQuery(text), signal));
}

function documentChunks(media: EmbedRow): string[] {
  const title = media.title_english ?? media.title_romaji ?? 'Unknown';
  const header = [
    title,
    media.genres ? `Genres: ${media.genres}` : '',
    media.tags ? `Tags: ${media.tags}` : '',
  ].filter(Boolean).join('\n');
  const synopsis = (media.synopsis ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const full = synopsis ? `${header}\n${synopsis}` : header;

  if (full.length <= CHUNK_CHARS) return [full];
  const chunks: string[] = [];
  let current = '';
  for (const word of full.split(/\s+/)) {
    if (current.length + word.length + 1 > CHUNK_CHARS && current) {
      chunks.push(current);
      current = `${title} — `;
    }
    current += (current && !current.endsWith(' ') ? ' ' : '') + word;
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

async function embedFitting(text: string): Promise<number[]> {
  let input = text;
  for (;;) {
    try {
      return await embed(asDocument(input));
    } catch (err) {
      const overflow = /context length|input length|exceeds|too (?:long|large)/i
        .test((err as Error).message);
      if (!overflow || input.length <= 120) throw err;
      input = input.slice(0, Math.floor(input.length * 0.7));   // trim ~30% and retry
    }
  }
}

function meanPool(vectors: number[][]): number[] {
  const dims = vectors[0]!.length;
  const pooled = new Array<number>(dims).fill(0);
  for (const vector of vectors) {
    for (let dim = 0; dim < dims; dim++) pooled[dim]! += vector[dim]!;
  }
  for (let dim = 0; dim < dims; dim++) pooled[dim]! /= vectors.length;
  return pooled;
}

async function embedOne(media: EmbedRow, counters: EmbedCounters): Promise<void> {
  const chunks = documentChunks(media);
  // Hash over every chunk so unchanged content is still skipped on re-runs.
  const inputHash = sha256(`${EMBED_MODEL_ID}␟${chunks.join('␟')}`);

  const [existing] = await query<{ input_hash: string }>(
    `SELECT input_hash FROM media_embedding WHERE media_id = $1 AND model_id = $2`,
    [media.id, EMBED_MODEL_ID],
  );
  if (existing?.input_hash === inputHash) { counters.skipped++; return; }

  try {
    // Embed every chunk, then pool into one vector so the whole title is captured.
    const vectors: number[][] = [];
    for (const chunk of chunks) vectors.push(await embedFitting(chunk));
    const vector = toVector(vectors.length === 1 ? vectors[0]! : meanPool(vectors));
    await query(
        `INSERT INTO media_embedding (media_id, model_id, embedding, input_hash)
     VALUES ($1,$2,$3::vector,$4)
     ON CONFLICT (media_id, model_id) DO UPDATE SET
       embedding = EXCLUDED.embedding, input_hash = EXCLUDED.input_hash, created_at = now()`,
        [media.id, EMBED_MODEL_ID, vector, inputHash],
    );
    counters.ok++;

  } catch (err) {
    counters.failed++;
    console.warn(`embed media ${media.id} failed: ${(err as Error).message}`);
    return;
  }
}

export async function embedCatalogue(limit = 100_000): Promise<EmbedCounters> {
  const rows = await query<EmbedRow>(
    `SELECT m.id, m.title_romaji, m.title_english, m.synopsis,
            string_agg(DISTINCT g.name, ', ') AS genres,
            string_agg(DISTINCT t.name, ', ') AS tags
       FROM media m
       LEFT JOIN media_genre mg ON mg.media_id = m.id
       LEFT JOIN genre       g  ON g.id = mg.genre_id
       LEFT JOIN media_tag   mt ON mt.media_id = m.id AND mt.rank >= 40
       LEFT JOIN tag         t  ON t.id = mt.tag_id
      GROUP BY m.id
      ORDER BY m.popularity DESC NULLS LAST
      LIMIT $1`,
    [limit],
  );

  const counters: EmbedCounters = { ok: 0, skipped: 0, failed: 0 };
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < rows.length) {
      const media = rows[cursor++]!;
      await embedOne(media, counters);
      const done = counters.ok + counters.skipped + counters.failed;
      if (done % 200 === 0) {
        console.log(`  ${done}/${rows.length} (ok=${counters.ok} skip=${counters.skipped} fail=${counters.failed})`);
      }
    }
  };
  await Promise.all(Array.from({ length: config.ENRICH_CONCURRENCY }, worker));

  console.log(`embedding done: ok=${counters.ok} skipped=${counters.skipped} failed=${counters.failed}`);
  return counters;
}
