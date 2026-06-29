import type { Shape } from '@coalesce/board';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

/** Subscribe to a room's shape map and re-render on any change. */
export function useShapes(shapes: Y.Map<Shape> | undefined): Shape[] {
  const [list, setList] = useState<Shape[]>([]);

  useEffect(() => {
    if (!shapes) return;
    const update = () => setList(Array.from(shapes.values()));
    update();
    shapes.observe(update);
    return () => shapes.unobserve(update);
  }, [shapes]);

  return list;
}
