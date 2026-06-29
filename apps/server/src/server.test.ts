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

describe('room access', () => {
  it('creates a room with an owner token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/rooms' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { roomId: string; token: string };
    expect(body.roomId).toBeTruthy();
    expect(body.token).toBeTruthy();
  });

  it('refuses to mint a link without an owner token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms/any/links',
      payload: { role: 'viewer' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('mints a viewer link for the room owner', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/rooms' });
    const { roomId, token } = created.json() as { roomId: string; token: string };
    const res = await app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/links`,
      headers: { authorization: `Bearer ${token}` },
      payload: { role: 'viewer' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ role: 'viewer' });
  });

  it('rejects an owner token issued for a different room', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/rooms' });
    const { token } = created.json() as { roomId: string; token: string };
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms/some-other-room/links',
      headers: { authorization: `Bearer ${token}` },
      payload: { role: 'editor' },
    });
    expect(res.statusCode).toBe(403);
  });
});
