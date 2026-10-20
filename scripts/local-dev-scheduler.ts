import type { PersistentManifest } from './local-dev-persistence';
import { assertPersistentDiskBudget } from './local-dev-persistence';

/** Run one complete publication cycle at a time; Stop owns cancellation. */
export function startPersistentPublicationScheduler(manifest: PersistentManifest) {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let refuse!: (error: Error) => void;
  const failure = new Promise<never>((_resolve, reject) => {
    refuse = reject;
  });
  const schedule = async () => {
    try {
      assertPersistentDiskBudget(manifest.stateDirectory);
    } catch (error) {
      refuse(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    try {
      await fetch(`http://127.0.0.1:${manifest.publisherPort}/__scheduled`, {
        signal: abort.signal,
      });
    } catch (error) {
      console.error('Local publisher cycle failed:', error instanceof Error ? error.message : error);
    }
    if (!abort.signal.aborted) {
      timer = setTimeout(() => {
        void schedule();
      }, 5000);
    }
  };
  timer = setTimeout(() => {
    void schedule();
  }, 5000);
  return {
    failure,
    stop() {
      abort.abort();
      clearTimeout(timer);
    },
  };
}
