/**
 * Where `generate:images` keeps its content-addressed variant store, and whether `public/` already holds its output.
 *
 * A variant is named `<src20>.<recipe10>.<ext>` after its original's SHA-256 and its recipe with the encoder versions (#1888 step 3), so a name never changes meaning and one store can serve every checkout on a machine.
 * Off CI the store is shared, so a new worktree fills its `public/` from what an earlier one already downloaded, without a request.
 * CI keeps the store inside the checkout, where `actions/cache` saves and restores it.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

type Environment = Record<string, string | undefined>;

/** The store inside a checkout, which CI caches between runs. */
export function checkoutStoreRoot(repoRoot: string): string {
  return path.join(repoRoot, '.cache/media/local/v');
}

/** The variant store: MEDIA_STORE_DIR when set, the checkout's own store on CI, otherwise one store for the whole machine. */
export function mediaStoreRoot(repoRoot: string, env: Environment = process.env, home = homedir()): string {
  const configured = env.MEDIA_STORE_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  if (env.CI === 'true' || env.GITHUB_ACTIONS === 'true') {
    return checkoutStoreRoot(repoRoot);
  }
  const cacheHome = env.XDG_CACHE_HOME?.trim() || path.join(home, '.cache');
  return path.join(cacheHome, 'dunezone/media/v');
}

/** Whether the store is the checkout's own, which `--prune` may trim without touching another checkout's variants. */
export function isCheckoutStore(repoRoot: string, storeRoot: string): boolean {
  return path.resolve(storeRoot) === path.resolve(checkoutStoreRoot(repoRoot));
}

/** The files whose bytes decide what `generate:images` writes, the same ones CI keys its store cache on. */
export const IMAGE_INPUTS = [
  'media/raster.lock.json',
  'src/shared/assetRules.ts',
  'scripts/generate-images.ts',
  'scripts/media-variants.ts',
] as const;

/** A digest of the generator's inputs and the encoder versions, recorded once `public/` is written. */
export function imageInputsDigest(repoRoot: string, encoderVersions: Record<string, string | undefined>): string {
  const hash = createHash('sha256');
  for (const input of IMAGE_INPUTS) {
    hash
      .update(`${input}\0`)
      .update(readFileSync(path.join(repoRoot, input)))
      .update('\0');
  }
  hash.update(JSON.stringify(encoderVersions));
  return hash.digest('hex');
}

/** The record of the inputs `public/` was last generated from. It sits in the checkout, because `public/` does. */
export function imageStampPath(repoRoot: string): string {
  return path.join(repoRoot, '.cache/media/public-stamp');
}

/** Whether `public/` was generated from exactly these inputs and still holds the generated trees. */
export function generatedImagesCurrent(repoRoot: string, digest: string): boolean {
  const stamp = imageStampPath(repoRoot);
  return (
    existsSync(stamp) &&
    readFileSync(stamp, 'utf8').trim() === digest &&
    existsSync(path.join(repoRoot, 'public/m')) &&
    existsSync(path.join(repoRoot, 'public/image'))
  );
}
