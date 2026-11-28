/** A set of listeners that each hear every value told to them, in the order they subscribed. */
export class Listeners<T = void> {
  private readonly listeners = new Set<(value: T) => void>();

  subscribe = (listener: (value: T) => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  notify(value: T) {
    for (const listener of this.listeners) {
      listener(value);
    }
  }
}
