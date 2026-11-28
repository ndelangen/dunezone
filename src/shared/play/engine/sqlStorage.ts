/*
 * The slice of Durable Object storage the engine uses (`sql.exec` and `transactionSync`), over any SQLite a host has.
 * The Worker hands the engine its Durable Object's own storage; a browser host (the tutorial, Play / Sandbox) runs SQLite
 * compiled to WebAssembly, and a test runs Node's, so every host answers the session's statements with the same SQL engine.
 */

type Row = Record<string, SqlStorageValue>;

/** The two calls a host's SQLite must answer: one statement with its bindings, and a bare statement for transactions. */
export type SqlDatabase = Readonly<{
  /** Runs one statement and answers its rows, none for a statement that returns nothing. */
  query: (text: string, bindings: readonly SqlStorageValue[]) => Row[];
  /** Runs a statement that takes no bindings and returns nothing. */
  run: (text: string) => void;
}>;

function cursor<T extends Row>(rows: T[]) {
  return {
    toArray: () => rows,
    one: () => {
      if (rows.length !== 1) {
        throw new Error(`Expected exactly one row, found ${rows.length}.`);
      }
      return rows[0]!;
    },
    [Symbol.iterator]: () => rows[Symbol.iterator](),
  };
}

/** Storage over a host's SQLite. Transactions nest as savepoints, as a Durable Object's do. */
export function sqlStorage(database: SqlDatabase): DurableObjectStorage {
  let depth = 0;
  return {
    sql: {
      exec: <T extends Row>(query: string, ...bindings: SqlStorageValue[]) =>
        cursor(database.query(query, bindings) as T[]) as unknown as SqlStorageCursor<T>,
    },
    transactionSync<T>(closure: () => T): T {
      const name = `engine_${depth++}`;
      database.run(`SAVEPOINT ${name}`);
      try {
        const result = closure();
        database.run(`RELEASE ${name}`);
        return result;
      } catch (error) {
        database.run(`ROLLBACK TO ${name}`);
        database.run(`RELEASE ${name}`);
        throw error;
      } finally {
        depth--;
      }
    },
  } as unknown as DurableObjectStorage;
}
