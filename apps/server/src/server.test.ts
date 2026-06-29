import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '~/server.ts';

const app = await buildApp();
afterAll(() => app.close());

describe('http surface', () => {
  it('reports health with live stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', rooms: 0, connections: 0 });
  });

  it('returns an empty snapshot for a room with no live doc', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/rooms/ghost' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ exists: false, clients: 0, shapes: [] });
  });
});
