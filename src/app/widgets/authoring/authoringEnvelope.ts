/**
 * An editor's whole session state, split by what happens to it at save.
 *
 * `data` is the stored shape and the only half that is ever posted.
 * `memory` is what the session needs and storage has no room for: a declared mode, a remembered value the author may come back to.
 * The split exists because the stored schemas are strict, so a UI-only key inside `data` would be refused at save rather than ignored.
 */
export type AuthoringEnvelope<Data, Memory> = {
  data: Data;
  memory: Memory;
};

/** The one shape `postedPayload` needs from a schema, so callers pass the schema itself rather than a hand-copied key list. */
export type StoredShape = { shape: Record<string, unknown> };

/**
 * The payload a save posts: `data` narrowed to the stored schema's own keys.
 *
 * Memory lives beside `data` rather than inside it, so this pick is a guard rather than the mechanism, and it stays because the guard is what makes the separation checkable.
 * Reading the keys off the schema rather than listing them means a field added to the stored shape is posted without anyone remembering to widen a second list.
 */
export function postedPayload<Data extends object>(schema: StoredShape, data: Data): Data {
  const stored = new Set(Object.keys(schema.shape));
  return Object.fromEntries(Object.entries(data).filter(([key]) => stored.has(key))) as Data;
}
