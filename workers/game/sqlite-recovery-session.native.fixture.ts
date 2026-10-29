import { GameSession as StoredGameSession } from './session';

let armed = false;
let failure: string | undefined;

export function failNextLoad() {
  armed = true;
}

export function loadFailure() {
  return failure;
}

/** Runs a real SQLite allocation failure inside the production constructor's transaction. */
export class GameSession extends StoredGameSession {
  constructor(...args: ConstructorParameters<typeof StoredGameSession>) {
    if (armed) {
      armed = false;
      try {
        args[0].sql.exec('PRAGMA quick_check').toArray();
      } catch (error) {
        failure = error instanceof Error ? error.message : 'unknown';
        throw error;
      }
    }
    super(...args);
  }
}
