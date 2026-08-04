import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { searchQuery } from '../../search/query.js';
import { whysFor } from '../../search/explain.js';
import type { WhyTarget } from '../../types';
import { verifyJwt } from '../../auth/jwt.js';

async function authedUserId(request: FastifyRequest): Promise<string | undefined> {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return undefined;
  const claims = await verifyJwt(token);
  return claims?.sub;
}

const Body = z.object({
  query: z.string().min(1),
  username: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  explain: z.boolean().optional(),
});

const WhyBody = z.object({
  query: z.string().min(1),
  items: z.array(z.object({
    media_id: z.string(),
    title: z.string().nullable().optional(),
    description: z.string().optional(),
  })).min(1).max(50),
});

function whyKey(query: string): string {
  return 'why:' + createHash('sha256').update(query.toLowerCase().trim()).digest('hex');
}

export async function searchRecommendations(request: FastifyRequest, reply: FastifyReply) {
  const parsed = Body.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.issues });
  }
  const { query, username, limit, explain } = parsed.data;
  const userId = await authedUserId(request);
  const userName = username?.trim() ? username.trim() : undefined;
  const result = await searchQuery({ q: query, userId, userName, limit, explain });
  request.log.info({ cache: result.source, query }, 'search');
  return reply.send(result.recommendations);
}

export async function searchWhys(request: FastifyRequest, reply: FastifyReply) {
  const parsed = WhyBody.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.issues });
  }
  const { query, items } = parsed.data;
  const targets: WhyTarget[] = items.map((item) => ({
    media_id: item.media_id, title: item.title ?? null, description: item.description ?? '', why: '',
  }));
  const whys = await whysFor(whyKey(query), [query], targets);
  return reply.send({ whys: [...whys].map(([media_id, why]) => ({ media_id, why })) });
}
