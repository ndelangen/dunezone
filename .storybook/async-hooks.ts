type Callback<Args extends unknown[], Result> = (...args: Args) => Result;

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value;
}

export class AsyncLocalStorage<Store> {
  private current: Store | undefined;

  getStore(): Store | undefined {
    return this.current;
  }

  run<Args extends unknown[], Result>(store: Store, callback: Callback<Args, Result>, ...args: Args): Result {
    return this.withStore(store, callback, args);
  }

  exit<Args extends unknown[], Result>(callback: Callback<Args, Result>, ...args: Args): Result {
    return this.withStore(undefined, callback, args);
  }

  private withStore<Args extends unknown[], Result>(
    store: Store | undefined,
    callback: Callback<Args, Result>,
    args: Args
  ): Result {
    const previous = this.current;
    this.current = store;
    try {
      const result = callback(...args);
      if (isPromiseLike(result)) {
        return Promise.resolve(result).finally(() => {
          this.current = previous;
        }) as Result;
      }
      this.current = previous;
      return result;
    } catch (error) {
      this.current = previous;
      throw error;
    }
  }
}
