import { describe, expect, it } from 'vitest';
import { createBucket } from '~/ratelimit.ts';

describe('token bucket', () => {
  it('allows a burst up to capacity then blocks', () => {
    let now = 0;
    const bucket = createBucket(() => now);
    let allowed = 0;
    for (let i = 0; i < 400; i++) if (bucket.take()) allowed++;
    // Capacity is 300; the rest are dropped while time stands still.
    expect(allowed).toBe(300);
    expect(bucket.take()).toBe(false);
  });

  it('refills over time', () => {
    let now = 0;
    const bucket = createBucket(() => now);
    while (bucket.take()) {
      /* drain */
    }
    expect(bucket.take()).toBe(false);
    now += 1000; // one second → +150 tokens
    let allowed = 0;
    while (bucket.take()) allowed++;
    expect(allowed).toBeGreaterThanOrEqual(150);
    expect(allowed).toBeLessThan(160);
  });
});
