export type RulebookReaderSearch = { edition?: number | undefined; loc?: string | undefined };

/**
 * Reads the reader's own two search parameters, and answers for both of them every time.
 * Both keys are always present, `undefined` included: a route's search is the parent match's search merged with this result, so omitting a rejected key does not drop it, it lets the raw value through to the loader and into the Convex query.
 * That is how `?edition=abc` reached `edition_number` and turned the public page into an error frame.
 */
export function parseReaderSearch(input: Record<string, unknown>): RulebookReaderSearch {
  const rawEdition = typeof input.edition === 'string' ? Number(input.edition) : input.edition;
  const edition =
    typeof rawEdition === 'number' && Number.isSafeInteger(rawEdition) && rawEdition > 0 ? rawEdition : undefined;
  return { edition, loc: typeof input.loc === 'string' ? input.loc : undefined };
}
