import type { Role } from '@coalesce/board';

/**
 * Client-side token + identity helpers. Tokens are capabilities minted by the
 * server (owner/editor/viewer for a room); we stash them per-room in
 * localStorage so a role survives reloads, and decode the role for UI only —
 * the server is the source of truth and enforces write access.
 */

const TOKEN_PREFIX = 'coalesce:token:';
const SEED_KEY = 'coalesce:user-seed';

export function storeToken(roomId: string, token: string): void {
  try {
    localStorage.setItem(TOKEN_PREFIX + roomId, token);
  } catch {
    // localStorage unavailable (private mode / SSR) — role just won't persist.
  }
}

export function getToken(roomId: string): string | null {
  try {
    return localStorage.getItem(TOKEN_PREFIX + roomId);
  } catch {
    return null;
  }
}

/** Decode a token's role for UI gating. Never trusted for access — server enforces. */
export function roleFromToken(token: string | null): Role {
  if (!token) return 'editor';
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { role?: unknown };
    return payload.role === 'owner' || payload.role === 'viewer'
      ? (payload.role as Role)
      : 'editor';
  } catch {
    return 'editor';
  }
}

/** A stable per-browser seed so a user keeps the same name/color across reloads. */
export function userSeed(): number {
  try {
    let value = localStorage.getItem(SEED_KEY);
    if (!value) {
      value = String(Math.floor(Math.random() * 1_000_000_000));
      localStorage.setItem(SEED_KEY, value);
    }
    return Number(value);
  } catch {
    return 1;
  }
}
