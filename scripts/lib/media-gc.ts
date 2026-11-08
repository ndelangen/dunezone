/**
 * The retention rules of #1888 as a pure plan: which R2 objects a collection could remove, and why every other one stays.
 *
 * An original or variant stays while any release record lists it, prepared or deployed, because published HTML may reference it forever.
 * It also stays while the lock on main or on any open pull request references it, or while it is younger than the minimum age.
 * Only what is left is a candidate, and this plan never deletes anything itself.
 *
 * The same listing also proves the opposite direction (`missingVariants`): every variant a release record lists is still stored, at the size it was published with.
 * Deploys trust that, because R2 objects are create-only and nothing deletes them, so they only ask R2 about variants no earlier deploy proved.
 */
import type { RasterLock } from '../../src/shared/media/rasterLock';

const GC_MIN_AGE_DAYS = 30;

const SOURCE_KEY = /^sha256\/([0-9a-f]{64})$/;
const VARIANT_KEY = /^v\/(.+)$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export type StoredObject = { key: string; bytes: number; uploaded: string };

/** The part of a release record these checks read: each variant's name, the original it was encoded from, and its size where the record has one. */
export type ReleaseVariant = { name: string; source: string; bytes?: number };

/** A variant some release record lists that the variant bucket lacks, or stores at another size. */
export type MissingVariant = { name: string; bytes: number | null; stored: number | null };

/** Every variant a release record lists that the bucket listing lacks or holds at a different size, each name once. */
export function missingVariants(
  variants: readonly StoredObject[],
  releases: readonly (readonly ReleaseVariant[])[]
): MissingVariant[] {
  const stored = new Map<string, number>();
  for (const object of variants) {
    const name = VARIANT_KEY.exec(object.key)?.[1];
    if (name !== undefined) {
      stored.set(name, object.bytes);
    }
  }
  const missing = new Map<string, MissingVariant>();
  for (const variant of releases.flat()) {
    const bytes = stored.get(variant.name);
    const expected = variant.bytes ?? null;
    if (bytes === undefined || (expected !== null && bytes !== expected)) {
      missing.set(variant.name, { name: variant.name, bytes: expected, stored: bytes ?? null });
    }
  }
  return [...missing.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export type GcInputs = {
  sources: readonly StoredObject[];
  variants: readonly StoredObject[];
  releases: readonly (readonly ReleaseVariant[])[];
  /** The lock on main first, then one per open pull request. */
  locks: readonly RasterLock[];
  /** The variant names a lock plans with the installed encoder. */
  planNames: (lock: RasterLock) => readonly string[];
  now: Date;
  minAgeDays?: number;
};

export type BucketReport = {
  objects: number;
  inRelease: number;
  inLock: number;
  young: number;
  /** Keys outside the layout this plan knows, which are never candidates. */
  unrecognised: string[];
  candidates: StoredObject[];
};

type Reason = 'inRelease' | 'inLock' | 'young' | 'unrecognised' | 'candidate';

/** What keeps one bucket's objects: the ids release records and locks reference, and the newest upload time a candidate may have. */
type Retention = { released: ReadonlySet<string>; locked: ReadonlySet<string>; cutoff: number };

function classify(object: StoredObject, id: string | undefined, retention: Retention): Reason {
  if (id === undefined) {
    return 'unrecognised';
  }
  if (retention.released.has(id)) {
    return 'inRelease';
  }
  if (retention.locked.has(id)) {
    return 'inLock';
  }
  const uploaded = Date.parse(object.uploaded);
  /* An object with an unreadable upload time is treated as young, so it is never collected on a guess. */
  return Number.isNaN(uploaded) || uploaded > retention.cutoff ? 'young' : 'candidate';
}

function bucketReport(objects: readonly StoredObject[], pattern: RegExp, retention: Retention): BucketReport {
  const report: BucketReport = {
    objects: objects.length,
    inRelease: 0,
    inLock: 0,
    young: 0,
    unrecognised: [],
    candidates: [],
  };
  for (const object of objects) {
    const reason = classify(object, pattern.exec(object.key)?.[1], retention);
    if (reason === 'unrecognised') {
      report.unrecognised.push(object.key);
    } else if (reason === 'candidate') {
      report.candidates.push(object);
    } else {
      report[reason] += 1;
    }
  }
  return report;
}

/** Splits both buckets into what the retention rules keep and what a collection could remove. */
export function planCollection(inputs: GcInputs): { sources: BucketReport; variants: BucketReport } {
  const cutoff = inputs.now.getTime() - (inputs.minAgeDays ?? GC_MIN_AGE_DAYS) * DAY_MS;
  const releasedVariants = inputs.releases.flatMap((record) => record.map((variant) => variant.name));
  const releasedSources = inputs.releases.flatMap((record) => record.map((variant) => variant.source));
  const lockedSources = inputs.locks.flatMap((lock) => Object.values(lock).map((entry) => entry.sha256));
  const lockedVariants = inputs.locks.flatMap((lock) => inputs.planNames(lock));
  return {
    sources: bucketReport(inputs.sources, SOURCE_KEY, {
      released: new Set(releasedSources),
      locked: new Set(lockedSources),
      cutoff,
    }),
    variants: bucketReport(inputs.variants, VARIANT_KEY, {
      released: new Set(releasedVariants),
      locked: new Set(lockedVariants),
      cutoff,
    }),
  };
}
