/** Creates the session's SQL tables before its domain stores read them. */
export function initializeSessionStorage(sql: SqlStorage) {
  sql.exec('CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
  sql.exec('CREATE TABLE IF NOT EXISTS current_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
  sql.exec(
    'CREATE TABLE IF NOT EXISTS receipts (receipt_key TEXT PRIMARY KEY, actor_id TEXT, payload TEXT NOT NULL, revision INTEGER NOT NULL)'
  );
  sql.exec(
    'CREATE TABLE IF NOT EXISTS actors (user_id TEXT PRIMARY KEY, seat TEXT NOT NULL, display_name TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, avatar_url TEXT, profile_slug TEXT)'
  );
  /* Games created before players carried a profile link gain the column; their players read as unlinked until they next connect. */
  const actorColumns = sql.exec<{ name: string }>('PRAGMA table_info(actors)').toArray();
  if (!actorColumns.some((column) => column.name === 'profile_slug')) {
    sql.exec('ALTER TABLE actors ADD COLUMN profile_slug TEXT');
  }
  sql.exec(
    'CREATE TABLE IF NOT EXISTS seat_history (id INTEGER PRIMARY KEY, user_id TEXT, display_name TEXT NOT NULL, seat TEXT NOT NULL, event TEXT NOT NULL, created_at INTEGER NOT NULL, cause TEXT, approver_id TEXT, approver_name TEXT, event_id TEXT)'
  );
  sql.exec(
    'CREATE TABLE IF NOT EXISTS public_action_history (receipt_key TEXT PRIMARY KEY, user_id TEXT, display_name TEXT NOT NULL, action TEXT NOT NULL, contents TEXT, created_at INTEGER NOT NULL)'
  );
  sql.exec('CREATE TABLE IF NOT EXISTS battle_results (revision INTEGER PRIMARY KEY, data TEXT NOT NULL)');
  sql.exec('CREATE TABLE IF NOT EXISTS deletion_receipts (event_id TEXT PRIMARY KEY)');
  /*
   * Server-side only: which account filed a spawn request, so history replay can mask a deleted
   * requester, and the captured definitions the live snapshot omits, so approval and dismissal
   * audit rows still carry the full contents.
   */
  sql.exec(
    'CREATE TABLE IF NOT EXISTS spawn_requests (request_id TEXT PRIMARY KEY, user_id TEXT, definitions TEXT NOT NULL)'
  );
  /* The seating a game fixed: one row per seat with its station and the faction it carries. */
  sql.exec(
    'CREATE TABLE IF NOT EXISTS seats (seat TEXT PRIMARY KEY, position INTEGER NOT NULL UNIQUE, faction_id TEXT UNIQUE, faction_name TEXT, faction_color TEXT)'
  );
}
