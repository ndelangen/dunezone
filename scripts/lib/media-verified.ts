/**
 * Which variants a production deploy must download again to prove parity, and which earlier deploys already proved.
 *
 * `media:publish --verify` downloads a variant from `/m` and from its legacy URL and checks both against the local record.
 * Once both matched, they keep matching: R2 objects are create-only and nothing deletes them, and a legacy URL stands for the variant its lock entry names.
 * So a deploy records every entry it proved, and the next deploy downloads only the entries that record lacks, plus a random sample of the rest.
 * The sample is what catches a release that serves every URL wrongly, such as a broken handler.
 * An entry is its legacy path, variant name, SHA-256 and byte length, so a changed lock entry, recipe or encoder output is a new entry and is always downloaded.
 * The record is only ever a reason to skip a download: `media:publish` still checks every variant's stored integrity before the release goes live.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { ChecksumRecord, PlannedVariant } from '../media-variants';

/** Entries the sample takes from those an earlier deploy proved. */
export const VERIFY_SAMPLE_SIZE = 128;

type VerifiedFile = { schemaVersion: 1; entries: string[] };

/** One plan entry with the record its bytes must match. */
export type VerifiableEntry = { variant: PlannedVariant; record: ChecksumRecord };

export function verifiedIdentity({ variant, record }: VerifiableEntry): string {
  return [variant.legacyPath, variant.name, record.sha256, record.bytes].join(' ');
}

/** Reads the entries earlier deploys proved; a missing or unreadable file proves nothing, so every entry is downloaded. */
export function readVerified(file: string): Set<string> {
  if (!existsSync(file)) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<VerifiedFile>;
    return parsed.schemaVersion === 1 && Array.isArray(parsed.entries) ? new Set(parsed.entries) : new Set();
  } catch {
    return new Set();
  }
}

/** Writes the proved entries sorted, so the same set always has the same bytes. */
export function writeVerified(file: string, entries: Iterable<string>): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const body: VerifiedFile = { schemaVersion: 1, entries: [...new Set(entries)].sort() };
  writeFileSync(file, `${JSON.stringify(body)}\n`);
}

/** Every entry no earlier deploy proved, then up to `sampleSize` of the proved ones chosen at random. */
export function selectChecks<T extends VerifiableEntry>(
  entries: readonly T[],
  verified: ReadonlySet<string>,
  sampleSize = VERIFY_SAMPLE_SIZE,
  random: () => number = Math.random
): { unproved: T[]; sampled: T[]; skipped: number } {
  const unproved: T[] = [];
  const proved: T[] = [];
  for (const entry of entries) {
    (verified.has(verifiedIdentity(entry)) ? proved : unproved).push(entry);
  }
  /* A partial Fisher-Yates shuffle draws the sample without repeats. */
  const count = Math.min(sampleSize, proved.length);
  for (let index = 0; index < count; index += 1) {
    const pick = index + Math.floor(random() * (proved.length - index));
    [proved[index], proved[pick]] = [proved[pick], proved[index]];
  }
  return { unproved, sampled: proved.slice(0, count), skipped: proved.length - count };
}
