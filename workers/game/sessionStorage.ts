function tableColumns(sql: SqlStorage, table: 'seat_history' | 'actors'): Set<string> {
  return new Set(
    sql
      .exec<{ name: string }>(`PRAGMA table_info(${table})`)
      .toArray()
      .map((row) => row.name)
  );
}
/** Creates and upgrades the session's SQL tables before its domain stores read them. */
export function initializeSessionStorage(sql: SqlStorage) {
  sql.exec('CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
  sql.exec('CREATE TABLE IF NOT EXISTS current_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
  sql.exec(
    'CREATE TABLE IF NOT EXISTS receipts (receipt_key TEXT PRIMARY KEY, actor_id TEXT, payload TEXT NOT NULL, revision INTEGER NOT NULL)'
  );
  sql.exec(
    'CREATE TABLE IF NOT EXISTS actors (user_id TEXT PRIMARY KEY, seat TEXT NOT NULL, display_name TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)'
  );
  sql.exec(
    'CREATE TABLE IF NOT EXISTS seat_history (id INTEGER PRIMARY KEY, user_id TEXT, display_name TEXT NOT NULL, seat TEXT NOT NULL, event TEXT NOT NULL, created_at INTEGER NOT NULL)'
  );
  /*
   * Why a seat changed hands, who approved it and the event it wrote, added for explicit
   * participation. A room from before carries nulls there; an earlier release ignores the columns.
   */
  for (const column of ['cause TEXT', 'approver_id TEXT', 'approver_name TEXT', 'event_id TEXT']) {
    if (!tableColumns(sql, 'seat_history').has(column.split(' ')[0]!)) {
      sql.exec(`ALTER TABLE seat_history ADD COLUMN ${column}`);
    }
  }
  if (!tableColumns(sql, 'actors').has('avatar_url')) {
    sql.exec('ALTER TABLE actors ADD COLUMN avatar_url TEXT');
  }
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
  /*
   * The seating a game fixed: one row per seat with its station and the faction it carries.
   * A room provisioned before this table existed carried the fixture pair in `faction_seats`;
   * it receives its fixture plan once, and that older table stays in place unread so an earlier
   * release can still start against the same storage.
   */
  sql.exec(
    'CREATE TABLE IF NOT EXISTS seats (seat TEXT PRIMARY KEY, position INTEGER NOT NULL UNIQUE, faction_id TEXT UNIQUE, faction_name TEXT, faction_color TEXT)'
  );
  /* Server-side only: which account each draft or assignment event names, so a deletion can rebuild the event. */
  sql.exec(
    'CREATE TABLE IF NOT EXISTS draft_history (id INTEGER PRIMARY KEY, event_id TEXT NOT NULL, user_id TEXT, display_name TEXT NOT NULL, kind TEXT NOT NULL, faction_name TEXT, seat TEXT NOT NULL, position INTEGER)'
  );
}
