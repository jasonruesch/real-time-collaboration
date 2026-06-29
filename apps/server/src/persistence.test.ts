import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

// Integration test: only runs when a throwaway Postgres is provided via
// TEST_DATABASE_URL, so the default CI run (no database) skips it.
const TEST_DB = process.env.TEST_DATABASE_URL;
const suite = TEST_DB ? describe : describe.skip;

suite('persistence round-trip (Postgres)', () => {
  // Make the db client pick up the test database before it's imported.
  process.env.DATABASE_URL = TEST_DB;

  let loadDoc: typeof import('~/persistence.ts').loadDoc;
  let flushSave: typeof import('~/persistence.ts').flushSave;
  let sql: typeof import('~/db/client.ts').sql;

  beforeAll(async () => {
    const client = await import('~/db/client.ts');
    sql = client.sql;
    await client.ensureSchema();
    ({ loadDoc, flushSave } = await import('~/persistence.ts'));
  });

  afterAll(async () => {
    if (sql) await sql.end();
  });

  it('saves a doc and reloads it into a fresh doc', async () => {
    const name = `rt-${Math.random().toString(36).slice(2)}`;
    const doc = new Y.Doc();
    doc.getMap('shapes').set('a', {
      id: 'a',
      type: 'rect',
      x: 1,
      y: 2,
      w: 3,
      h: 4,
      color: '#6366f1',
      author: 1,
    });
    await flushSave(name, doc);

    const fresh = new Y.Doc();
    await loadDoc(name, fresh);
    expect(fresh.getMap('shapes').get('a')).toMatchObject({ id: 'a', x: 1, w: 3 });
  });
});
