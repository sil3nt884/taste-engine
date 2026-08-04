import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../db.js';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { signJwt } from '../../auth/jwt.js';

const SignupBody = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(200),
  emailAddress: z.email(),
  anilistUser: z.string().min(1).max(50).optional(),
  malUsername: z.string().min(1).max(50).optional(),
});

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function conflictField(constraint: string | undefined): string {
  if (!constraint) return 'account';
  if (constraint.includes('username')) return 'username';
  if (constraint.includes('email')) return 'email address';
  if (constraint.includes('mal')) return 'MyAnimeList username';
  if (constraint.includes('anilist')) return 'AniList username';
  return 'account';
}

export async function signUpUser(request: FastifyRequest, reply: FastifyReply) {
  const parsed = SignupBody.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.issues });
  }
  const { username, password, emailAddress, anilistUser, malUsername } = parsed.data;

  try {
    const id = uuidv4();
    const [row] = await query<{ id: string; username: string }>(
      `INSERT INTO user_account (id, username, password_hash, email, anilist_name, mal_name)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, username`,
      [id, username, hashPassword(password), emailAddress, anilistUser ?? null, malUsername ?? null],
    );
    return reply.code(201).send({ id: row!.id, username: row!.username });
  } catch (err) {
    const dbError = err as { code?: string; constraint?: string };
    if (dbError.code === '23505') {
      return reply.code(409).send({ error: `That ${conflictField(dbError.constraint)} is already taken.` });
    }
    throw err;
  }
}

export async function loginUser(request: FastifyRequest, reply: FastifyReply) {
  const parsed = LoginBody.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.issues });
  }
  const { username, password } = parsed.data;

  const [user] = await query<{ id: string; username: string; password_hash: string | null }>(
    `SELECT id, username, password_hash FROM user_account WHERE lower(username) = lower($1)`,
    [username],
  );
  // Same response whether the user is missing or the password is wrong.
  if (!user?.password_hash || !verifyPassword(password, user.password_hash)) {
    return reply.code(401).send({ error: 'Invalid username or password.' });
  }

  const token = await signJwt({ sub: user.id, username: user.username });
  return reply.send({ token });
}
