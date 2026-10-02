import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

export const APPLICATION_ASSET_MANIFEST = 'application-assets.json';
export const APPLICATION_ASSET_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const manifestSchema = z.object({
  version: z.literal(1),
  files: z
    .array(
      z.object({
        path: z.string().regex(/^public\/[A-Za-z0-9_~-]+-[A-Za-z0-9_-]+\.[A-Za-z0-9.]+$/),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        bytes: z
          .number()
          .int()
          .min(0)
          .max(25 * 1024 * 1024),
        current: z.boolean(),
        lastUsedAt: z.number().int().min(0),
      })
    )
    .max(20_000),
});
export type ApplicationAssetManifest = z.infer<typeof manifestSchema>;

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Import the deployed Vite dependency graph once, before it has a retention manifest. */
export async function bootstrapApplicationAssets(
  html: string,
  readPrevious: (assetPath: string) => Promise<Uint8Array>,
  now = Date.now()
): Promise<{ manifest: ApplicationAssetManifest; bytes: Map<string, Uint8Array> }> {
  const pending = new Set<string>();
  const bytes = new Map<string, Uint8Array>();
  const discover = (text: string) => {
    /* Vite uses /public URLs in HTML/CSS, public URLs in preload maps, and sibling imports in JS. */
    for (const match of text.matchAll(/["'(](?:\/?public\/|\.\/)([A-Za-z0-9_~-]+-[A-Za-z0-9_-]+\.[A-Za-z0-9.]+)/g)) {
      pending.add(`public/${match[1]}`);
    }
  };
  discover(html);
  if (![...pending].some((file) => file.endsWith('.js'))) {
    throw new Error('The deployed shell has no hashed application entry');
  }
  for (const file of pending) {
    if (pending.size > 20_000) {
      throw new Error('The deployed application graph exceeds the asset limit');
    }
    const content = await readPrevious(file);
    bytes.set(file, content);
    if (/\.(js|css)$/.test(file)) {
      discover(new TextDecoder().decode(content));
    }
  }
  const manifest = manifestSchema.parse({
    version: 1,
    files: [...bytes].map(([file, content]) => ({
      path: file,
      sha256: digest(content),
      bytes: content.length,
      current: true,
      lastUsedAt: now,
    })),
  });
  return { manifest, bytes };
}

export function writeApplicationAssetManifest(directory: string, now = Date.now()): ApplicationAssetManifest {
  const manifest = manifestSchema.parse({
    version: 1,
    files: readdirSync(path.join(directory, 'public'))
      .sort()
      .map((name) => {
        const bytes = readFileSync(path.join(directory, 'public', name));
        return { path: `public/${name}`, sha256: digest(bytes), bytes: bytes.length, current: true, lastUsedAt: now };
      }),
  });
  writeFileSync(path.join(directory, APPLICATION_ASSET_MANIFEST), JSON.stringify(manifest));
  return manifest;
}

/** Keep the previous release's chunks available even when its HTML predates this deployment. */
export async function retainApplicationAssets(
  directory: string,
  previousValue: unknown,
  readPrevious: (assetPath: string) => Promise<Uint8Array>,
  now = Date.now()
): Promise<number> {
  const previous = manifestSchema.parse(previousValue);
  const current = manifestSchema.parse(
    JSON.parse(readFileSync(path.join(directory, APPLICATION_ASSET_MANIFEST), 'utf8'))
  );
  const files = new Map(current.files.map((file) => [file.path, file]));
  let retained = 0;
  for (const file of previous.files) {
    const existing = files.get(file.path);
    if (existing) {
      if (existing.sha256 !== file.sha256 || existing.bytes !== file.bytes) {
        throw new Error(`Application asset path reused with different bytes: ${file.path}`);
      }
      continue;
    }
    /* The previous release can have been live for months; retention starts when it is replaced. */
    const lastUsedAt = file.current ? now : file.lastUsedAt;
    if (now - lastUsedAt > APPLICATION_ASSET_RETENTION_MS) {
      continue;
    }
    const bytes = await readPrevious(file.path);
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) {
      throw new Error(`Retained application asset failed its digest check: ${file.path}`);
    }
    mkdirSync(path.dirname(path.join(directory, file.path)), { recursive: true });
    writeFileSync(path.join(directory, file.path), bytes);
    files.set(file.path, { ...file, current: false, lastUsedAt });
    retained++;
  }
  writeFileSync(
    path.join(directory, APPLICATION_ASSET_MANIFEST),
    JSON.stringify({ version: 1, files: [...files.values()] })
  );
  return retained;
}
