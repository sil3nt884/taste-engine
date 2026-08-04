import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';
import type {JwtPayload} from "../types";

const secret = (): Uint8Array => new TextEncoder().encode(config.JWT_SECRET);

export async function signJwt(claims: { sub: string; username: string }): Promise<string> {
  return new SignJWT({ username: claims.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${config.JWT_TTL_SECONDS} seconds`)
    .sign(secret());
}

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string') return null;
    return {
      sub: payload.sub,
      username: typeof payload.username === 'string' ? payload.username : '',
      iat: payload.iat ?? 0,
      exp: payload.exp ?? 0,
    };
  } catch(e) {
    console.log(e)
    return null;
  }
}
