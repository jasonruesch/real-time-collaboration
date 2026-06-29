/**
 * A simple per-connection token bucket, the primary defense against a single
 * socket flooding the server. Pointer drags are already coalesced to one write
 * per animation frame (~60/s) client-side, so the ceiling here is generous
 * headroom for legitimate use while still cutting off a runaway client.
 */

const CAPACITY = 300; // max burst
const REFILL_PER_SEC = 150; // sustained rate

export interface TokenBucket {
  /** Consume one token; returns false when the bucket is empty (rate limited). */
  take(): boolean;
}

export function createBucket(now: () => number = Date.now): TokenBucket {
  let tokens = CAPACITY;
  let last = now();
  return {
    take() {
      const t = now();
      tokens = Math.min(CAPACITY, tokens + ((t - last) / 1000) * REFILL_PER_SEC);
      last = t;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

/** Largest accepted WebSocket message (bytes). Drops anything larger outright. */
export const MAX_MESSAGE_BYTES = 1_000_000;
