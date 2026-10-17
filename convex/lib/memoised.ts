/** Loads each key once per request, sharing the pending read with every caller that asks for the same key. */
export function memoised<Key, Value>(load: (key: Key) => Promise<Value>) {
  const loads = new Map<Key, Promise<Value>>();
  return (key: Key) => {
    let pending = loads.get(key);
    if (!pending) {
      pending = load(key);
      loads.set(key, pending);
    }
    return pending;
  };
}
