import 'zone.js';

type Callback<Args extends unknown[], Result> = (...args: Args) => Result;

const missingStore = Symbol('missing AsyncLocalStorage store');
let nextStorageId = 0;

/* PROTOTYPE: Maps Node's AsyncLocalStorage contract onto Zone.js.
   This is valid only when every async function in the worker closure has been downlevelled to
   Promise continuations. Native await bypasses ZoneAwarePromise. */
export class AsyncLocalStorage<Store> {
  private readonly key = `dunezone.asyncLocalStorage.${nextStorageId++}`;

  getStore(): Store | undefined {
    const store = Zone.current.get(this.key) as Store | typeof missingStore | undefined;
    return store === missingStore ? undefined : store;
  }

  run<Args extends unknown[], Result>(store: Store, callback: Callback<Args, Result>, ...args: Args): Result {
    return this.withStore(store, callback, args);
  }

  exit<Args extends unknown[], Result>(callback: Callback<Args, Result>, ...args: Args): Result {
    return this.withStore(missingStore, callback, args);
  }

  private withStore<Args extends unknown[], Result>(
    store: Store | typeof missingStore,
    callback: Callback<Args, Result>,
    args: Args
  ): Result {
    const zone = Zone.current.fork({
      name: this.key,
      properties: { [this.key]: store },
    });
    return zone.run(callback, undefined, args);
  }
}
