import { Button, Heading, Input, Text } from '@jasonruesch/react';
import { ArrowRight, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { storeToken } from '~/lib/auth';

/** Generate a short, URL-friendly room id. */
function newRoomId(): string {
  return crypto.randomUUID().split('-')[0];
}

/** Landing route: create a new board or join an existing one by id. */
export default function IndexPage() {
  const navigate = useNavigate();
  const [joinId, setJoinId] = useState('');
  const [creating, setCreating] = useState(false);

  // Create a board server-side to receive an owner token (lets the creator mint
  // share links). Falls back to a client-generated open room if the API is down.
  async function create() {
    setCreating(true);
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      if (!res.ok) throw new Error('create failed');
      const { roomId, token } = (await res.json()) as { roomId: string; token: string };
      storeToken(roomId, token);
      navigate(`/board/${roomId}`);
    } catch {
      navigate(`/board/${newRoomId()}`);
    } finally {
      setCreating(false);
    }
  }

  function join(event: FormEvent) {
    event.preventDefault();
    const id = joinId.trim();
    if (id) navigate(`/board/${encodeURIComponent(id)}`);
  }

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center gap-8 p-6">
      <div className="space-y-3">
        <Heading>Coalesce</Heading>
        <Text className="text-muted">
          A real-time collaborative whiteboard. Create a board, share the link,
          and draw together — every edit merges cleanly, even after going
          offline.
        </Text>
      </div>

      <div className="space-y-4">
        <Button onClick={() => void create()} disabled={creating}>
          <Plus size={18} aria-hidden />
          Create a new board
        </Button>

        <div className="flex items-center gap-3 text-muted">
          <span className="h-px flex-1 bg-line" />
          <Text className="text-sm">or join one</Text>
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={join} className="flex gap-2">
          <Input
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="Board id"
            aria-label="Board id to join"
          />
          <Button type="submit" variant="secondary" disabled={!joinId.trim()}>
            Join
            <ArrowRight size={18} aria-hidden />
          </Button>
        </form>
      </div>
    </div>
  );
}
