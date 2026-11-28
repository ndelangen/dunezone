import { sqlStorage } from '@shared/play/engine/sqlStorage';
import type { Statement } from 'sql.js';
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

/** A page game session's storage, the call that copies its database out, and the call that frees it once the table is done. */
export type PageStorage = Readonly<{ storage: DurableObjectStorage; image: () => Uint8Array; close: () => void }>;

/** A fresh in-memory database as a game session's storage: empty, or a copy of the image another one gave. */
export function pageStorage(image?: Uint8Array): PageStorage {
  const database = new SQL.Database(image);
  /* The session sends the same few statements over and over, so each one is compiled once and kept for the table's life. */
  const statements = new Map<string, Statement>();
  const forget = () => {
    for (const statement of statements.values()) {
      statement.free();
    }
    statements.clear();
  };
  const storage = sqlStorage({
    query: (text, bindings) => {
      let statement = statements.get(text);
      if (!statement) {
        statement = database.prepare(text);
        statements.set(text, statement);
      }
      try {
        statement.bind(bindings as (string | number | null)[]);
        const rows: Record<string, SqlStorageValue>[] = [];
        let columns: string[] | undefined;
        while (statement.step()) {
          columns ??= statement.getColumnNames();
          const values = statement.get();
          const row: Record<string, SqlStorageValue> = {};
          for (let index = 0; index < columns.length; index++) {
            row[columns[index]!] = values[index] as SqlStorageValue;
          }
          rows.push(row);
        }
        return rows;
      } finally {
        statement.reset();
      }
    },
    run: (text) => database.run(text),
  });
  /* A table left for good closes its database itself; the registry frees one a host never closed. */
  const token = {};
  closes.register(storage, database, token);
  return {
    storage,
    image: () => {
      /* sql.js frees every prepared statement when it exports, so the kept ones go first. */
      forget();
      return database.export();
    },
    close: () => {
      closes.unregister(token);
      forget();
      database.close();
    },
  };
}
