import type { Comment } from '@coalesce/board';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

/** Subscribe to a room's comment map and re-render on any change. */
export function useComments(comments: Y.Map<Comment> | undefined): Comment[] {
  const [list, setList] = useState<Comment[]>([]);

  useEffect(() => {
    if (!comments) return;
    const update = () => setList(Array.from(comments.values()));
    update();
    comments.observe(update);
    return () => comments.unobserve(update);
  }, [comments]);

  return list;
}
