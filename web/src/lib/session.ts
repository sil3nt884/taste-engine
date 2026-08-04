import 'server-only';
import { cookies } from 'next/headers';

const COOKIE = 'te_token';

export interface Session {
  token: string;
  userId: string;
  username: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodePayload(token: string): { sub?: string; username?: string; exp?: number } | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const payload = decodePayload(token);
  if (!payload?.sub || !UUID_RE.test(payload.sub)) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return { token, userId: payload.sub, username: payload.username ?? '' };
}

export async function setSessionToken(token: string): Promise<void> {
  const payload = decodePayload(token);
  const maxAge = payload?.exp ? Math.max(0, payload.exp - Math.floor(Date.now() / 1000)) : 60 * 60 * 24 * 7;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
