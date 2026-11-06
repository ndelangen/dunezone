/**
 * Builds and reads the variant packs `workers/publisher/media-pack.ts` serves, so a fresh checkout fills its store in a few downloads.
 *
 * A variant goes to the pack named by the first hex digit of its name, which is its original's hash, so new art changes one pack.
 * Within a pack the variants sit back to back in name order, and the index records each one's offset, length and SHA-256.
 */
import { createHash } from 'node:crypto';

/** One variant inside a pack. */
type PackEntry = { name: string; sha256: string; bytes: number; offset: number };
export type Pack = { sha256: string; bytes: number; entries: PackEntry[] };
export type PackIndex = { schemaVersion: 1; release: string; packs: Pack[] };

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Groups the variants into packs by the first hex digit of their names, each with its bytes and index entry. */
export function buildPacks(
  variants: readonly { name: string; bytes: Uint8Array }[]
): { pack: Pack; body: Uint8Array<ArrayBuffer> }[] {
  const groups = new Map<string, { name: string; bytes: Uint8Array }[]>();
  for (const variant of new Map(variants.map((v) => [v.name, v])).values()) {
    const group = variant.name[0];
    groups.set(group, [...(groups.get(group) ?? []), variant]);
  }
  return [...groups.keys()]
    .sort((left, right) => left.localeCompare(right))
    .map((group) => {
      const members = groups.get(group)!.sort((left, right) => left.name.localeCompare(right.name));
      const body = new Uint8Array(members.reduce((total, member) => total + member.bytes.byteLength, 0));
      let offset = 0;
      const entries = members.map((member) => {
        body.set(member.bytes, offset);
        const entry = { name: member.name, sha256: sha256(member.bytes), bytes: member.bytes.byteLength, offset };
        offset += member.bytes.byteLength;
        return entry;
      });
      return { pack: { sha256: sha256(body), bytes: body.byteLength, entries }, body };
    });
}

/** The variants a downloaded pack holds, each checked against its entry, or an error when the pack itself is not the one indexed. */
export function unpack(pack: Pack, body: Uint8Array): { name: string; bytes: Uint8Array }[] {
  if (body.byteLength !== pack.bytes || sha256(body) !== pack.sha256) {
    throw new Error(`pack ${pack.sha256} did not download intact`);
  }
  return pack.entries.flatMap((entry) => {
    const bytes = body.subarray(entry.offset, entry.offset + entry.bytes);
    return bytes.byteLength === entry.bytes && sha256(bytes) === entry.sha256 ? [{ name: entry.name, bytes }] : [];
  });
}

/** The packs worth downloading: those holding at least `threshold` of the missing variants. The rest are cheaper one by one from `/m`. */
export function packsWorthFetching(index: PackIndex, missing: ReadonlySet<string>, threshold: number): Pack[] {
  return index.packs.filter((pack) => pack.entries.filter((entry) => missing.has(entry.name)).length >= threshold);
}
