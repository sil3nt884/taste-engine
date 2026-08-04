import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyJwt } from './jwt.js';
import type { JwtPayload } from '../types';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const claims = token ? await verifyJwt(token) : null;
  if (!claims) {
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  req.user = claims;
}
