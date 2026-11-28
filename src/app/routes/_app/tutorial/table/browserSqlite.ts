import { sqlStorage } from '@shared/play/engine/sqlStorage';
import initSqlJs from 'sql.js/dist/sql-asm-memory-growth.js';

/*
 * SQLite compiled to plain JavaScript (asm.js), for the game session a page runs itself (the tutorial's chapters, Pages / Play / Sandbox).
 * The session's stores send the same SQL a game room sends its Durable Object, so the page answers them with SQLite too.
 * The app's Content Security Policy leaves out 'wasm-unsafe-eval' (docs/content-security-policy.md), so the page takes the build that needs no WebAssembly.
 * Its heap grows as tables do, so a table's database closes when the table is replaced, or once nothing holds its storage.
 * The module loads it once, before any table is built.
 */
const SQL = await initSqlJs();
const closes = new FinalizationRegistry<{ close: () => void }>((database) => database.close());

/** A fresh, empty in-memory database as a game session's storage, and a call that frees it once the table is done. */
export function pageStorage(): Readonly<{ storage: DurableObjectStorage; close: () => void }> {
  const database = new SQL.Database();
  const storage = sqlStorage({
    query: (text, bindings) => {
      const statement = database.prepare(text);
      try {
        statement.bind(bindings as (string | number | null)[]);
        const rows: Record<string, SqlStorageValue>[] = [];
        while (statement.step()) {
          rows.push(statement.getAsObject() as Record<string, SqlStorageValue>);
        }
        return rows;
      } finally {
        statement.free();
      }
    },
    run: (text) => database.run(text),
  });
  /* A table left for good closes its database itself; the registry frees one a host never closed. */
  const token = {};
  closes.register(storage, database, token);
  return {
    storage,
    close: () => {
      closes.unregister(token);
      database.close();
    },
  };
}
