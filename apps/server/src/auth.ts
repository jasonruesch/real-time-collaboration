import type { Role } from '@coalesce/board';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '~/env.ts';

/**
 * Room access is a capability model: a signed token grants a role for a specific
 * room. An owner token (minted when a board is created) can mint editor/viewer
 * links; editor/viewer tokens gate write/read at the WebSocket layer. There are
 * no user accounts — the token *is* the credential.
 */

const DEV_SECRET = 'coalesce-insecure-dev-secret';
const secret = new TextEncoder().encode(env.AUTH_SECRET ?? DEV_SECRET);

if (!env.AUTH_SECRET) {
  const message =
    'AUTH_SECRET is not set — using an insecure dev secret for room tokens.';
  if (env.NODE_ENV === 'production') console.error(message);
  else console.warn(message);
}

export interface RoomClaims {
  room: string;
  role: Role;
}

function isRole(value: unknown): value is Role {
  return value === 'owner' || value === 'editor' || value === 'viewer';
}

/** Sign a room token granting `role` for `room`. */
export function signRoomToken(room: string, role: Role): Promise<string> {
  return new SignJWT({ room, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .sign(secret);
}

/** Verify a token; returns its claims, or null if invalid/expired/malformed. */
export async function verifyRoomToken(token: string): Promise<RoomClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.room === 'string' && isRole(payload.role)) {
      return { room: payload.room, role: payload.role };
    }
    return null;
  } catch {
    return null;
  }
}
