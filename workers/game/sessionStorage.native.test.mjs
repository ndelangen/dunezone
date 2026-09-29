import { DatabaseSync } from 'node:sqlite';

import { describe, expect, test } from 'vitest';

import { initializeSessionStorage } from './sessionStorage';

/* The part of a Durable Object's SqlStorage the initializer uses, over an in-memory SQLite database. */
function sqlStorage(database) {
  return {
    exec(query, ...bindings) {
      const statement = database.prepare(query);
      const rows = statement.columns().length ? statement.all(...bindings) : (statement.run(...bindings), []);
      return { toArray: () => rows };
    },
  };
}

function actorColumns(database) {
  return database
    .prepare('PRAGMA table_info(actors)')
    .all()
    .map((column) => column.name);
}

describe('initializeSessionStorage', () => {
  test('a game created before profile links gains the column and keeps its players', () => {
    const database = new DatabaseSync(':memory:');
    database.exec(
      'CREATE TABLE actors (user_id TEXT PRIMARY KEY, seat TEXT NOT NULL, display_name TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, avatar_url TEXT)'
    );
    database.exec("INSERT INTO actors VALUES ('user-a', 'seat-1', 'Paul', 0, NULL)");

    initializeSessionStorage(sqlStorage(database));
    initializeSessionStorage(sqlStorage(database));

    expect(actorColumns(database)).toContain('profile_slug');
    expect(database.prepare('SELECT user_id, profile_slug FROM actors').all()).toEqual([
      { user_id: 'user-a', profile_slug: null },
    ]);
  });

  test('a new game creates the column directly', () => {
    const database = new DatabaseSync(':memory:');
    initializeSessionStorage(sqlStorage(database));
    expect(actorColumns(database)).toContain('profile_slug');
  });
});
