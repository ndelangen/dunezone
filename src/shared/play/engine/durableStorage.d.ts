/*
 * The slice of the Workers runtime's Durable Object storage types that the game Worker's session classes use,
 * declared for the app's build, which runs those classes on `MemorySql` and has no Workers runtime types of its own.
 * Copied from `workers/game/worker-configuration.d.ts`, the generated declarations the Worker itself is checked against.
 */

type SqlStorageValue = ArrayBuffer | string | number | null;

declare abstract class SqlStorageCursor<T extends Record<string, SqlStorageValue>> {
  toArray(): T[];
  one(): T;
  [Symbol.iterator](): IterableIterator<T>;
}

interface SqlStorage {
  exec<T extends Record<string, SqlStorageValue>>(query: string, ...bindings: any[]): SqlStorageCursor<T>;
}

interface DurableObjectStorage {
  sql: SqlStorage;
  transactionSync<T>(closure: () => T): T;
}
