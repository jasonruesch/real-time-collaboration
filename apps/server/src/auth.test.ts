import { describe, expect, it } from 'vitest';
import { signRoomToken, verifyRoomToken } from '~/auth.ts';

describe('room tokens', () => {
  it('round-trips room and role claims', async () => {
    const token = await signRoomToken('room-1', 'viewer');
    expect(await verifyRoomToken(token)).toEqual({ room: 'room-1', role: 'viewer' });
  });

  it('rejects a malformed token', async () => {
    expect(await verifyRoomToken('not.a.jwt')).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    // A token from another issuer must not verify under our secret.
    const foreign =
      'eyJhbGciOiJIUzI1NiJ9.eyJyb29tIjoieCIsInJvbGUiOiJvd25lciJ9.' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    expect(await verifyRoomToken(foreign)).toBeNull();
  });
});
