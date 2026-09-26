import type { SpawnContents } from '../../src/shared/play/inventory';
import type { ClientMessage, DeckAction, Viewer } from '../../src/shared/play/protocol';
import type { StoredSnapshot } from './state';

type Command = Extract<ClientMessage, { type: 'command' }>;
type SpawnAction = Extract<Command['action'], { kind: 'spawn-request' | 'spawn-approve' | 'spawn-dismiss' }>;
type Commit = {
  key: string;
  viewer: Viewer;
  message: Extract<ClientMessage, { type: 'drop' | 'command' }>;
  before: StoredSnapshot;
  next: StoredSnapshot;
  contents: SpawnContents | undefined;
  factionId: string | undefined;
};

/** Retains deck and spawn audit details inside the session's command transaction. */
export class PublicActions {
  constructor(private readonly storage: DurableObjectStorage) {}

  record(commit: Commit) {
    if (commit.message.type !== 'command') {
      return;
    }
    const action = commit.message.action;
    switch (action.kind) {
      case 'deck-draw':
      case 'deck-shuffle':
        this.recordDeck(commit, action);
        return;
      case 'spawn-request':
      case 'spawn-approve':
      case 'spawn-dismiss':
        this.recordSpawn(commit, action);
    }
  }

  private recordDeck(commit: Commit, action: DeckAction) {
    const recorded =
      action.kind === 'deck-draw' ? { ...action, recipient: action.recipient ?? commit.factionId } : action;
    this.write(commit, recorded, null);
  }

  private recordSpawn(commit: Commit, action: SpawnAction) {
    const request = this.requestFor(commit, action);
    const contents =
      commit.contents ?? (request && { ...request.contents, definitions: this.definitionsFor(request.id) });
    this.write(commit, action, JSON.stringify(contents));
  }

  private requestFor(commit: Commit, action: SpawnAction) {
    if (action.kind !== 'spawn-request') {
      return commit.before.controls?.requests.find((entry) => entry.id === action.requestId);
    }
    const pendingBefore = commit.before.controls?.requests.length ?? 0;
    if ((commit.next.controls?.requests.length ?? 0) <= pendingBefore) {
      return;
    }
    /* A sole player's request spawns directly and files nothing; only a filed request gets a row. */
    const filed = commit.next.controls!.requests.at(-1)!;
    this.storage.sql.exec(
      'INSERT OR IGNORE INTO spawn_requests VALUES(?,?,?)',
      filed.id,
      commit.viewer.userId,
      JSON.stringify(commit.contents?.definitions ?? [])
    );
    return filed;
  }

  private definitionsFor(requestId: string): SpawnContents['definitions'] {
    const row = this.storage.sql
      .exec<{ definitions: string }>('SELECT definitions FROM spawn_requests WHERE request_id=?', requestId)
      .toArray()[0];
    return row ? (JSON.parse(row.definitions) as SpawnContents['definitions']) : [];
  }

  private write(commit: Commit, action: DeckAction | SpawnAction, contents: string | null | undefined) {
    this.storage.sql.exec(
      'INSERT INTO public_action_history VALUES(?,?,?,?,?,?)',
      commit.key,
      commit.viewer.userId,
      commit.viewer.displayName,
      JSON.stringify(action),
      contents,
      Date.now()
    );
  }
}
