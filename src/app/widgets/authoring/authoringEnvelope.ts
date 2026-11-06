/**
 * The one shape `postedPayload` needs from a schema, so callers pass the schema itself rather than a hand-copied key list.
 */
export type StoredShape = { shape: Record<string, unknown> };

/**
 * The payload a save posts: a draft narrowed to the stored schema's own keys.
 *
 * Every editor keeps its session's memory beside its draft rather than inside it, because the stored schemas are strict and a UI-only key would be refused at save rather than ignored.
 * Card sessions share that split as `MemoryState` (`$type/cardDrafts.ts`), and the other editors keep it by convention, so this function is what makes it checkable from the save's side.
 * Reading the keys off the schema rather than listing them means a field added to the stored shape is posted without anyone remembering to widen a second list.
 */
export function postedPayload<Data extends object>(schema: StoredShape, data: Data): Data {
  const stored = new Set(Object.keys(schema.shape));
  return Object.fromEntries(Object.entries(data).filter(([key]) => stored.has(key))) as Data;
}
