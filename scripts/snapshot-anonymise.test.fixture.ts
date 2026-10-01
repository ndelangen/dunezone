import { encodeDocumentId } from './lib/snapshot-anonymiser';
import { anonymiseZip } from './snapshot-anonymise';

const FACTIONS_TABLE = 10_003;

/**
 * Writes `file`: a snapshot the anonymiser made from a synthetic export that holds `factions` published factions and nothing else.
 * With none, the file lacks the rows the rebuild contract requires, so every loader must refuse it.
 */
export function writtenSnapshot(file: string, factions: number): string {
  const rows = Array.from({ length: factions }, (_, index) => {
    const internalId = new Uint8Array(16);
    internalId[15] = index + 1;
    const faction = {
      _id: encodeDocumentId(FACTIONS_TABLE, internalId),
      _creationTime: 1_700_000_000_000 + index,
      owner_id: 'someone',
      data: { name: 'Fremen' },
      slug: `fremen-${index}`,
      is_deleted: false,
    };
    return `${JSON.stringify(faction)}\n`;
  });
  const tables = { users: 10_001, profiles: 10_002, factions: FACTIONS_TABLE };
  anonymiseZip(
    new Map([
      [
        '_tables/documents.jsonl',
        Object.entries(tables)
          .map(([name, id]) => `${JSON.stringify({ name, id })}\n`)
          .join(''),
      ],
      ['factions/documents.jsonl', rows.join('')],
    ]),
    file
  );
  return file;
}
