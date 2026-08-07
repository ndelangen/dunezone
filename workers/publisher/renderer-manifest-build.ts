import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { PUBLISHER_RENDERER_CONTRACT } from './renderer-contract';

export type RendererManifestEntry = {
  path: string;
  bytes: Uint8Array;
};

export const RENDERER_RUNTIME_CLOSURE_PATHS = [
  'workers/publisher/browser.ts',
  'workers/publisher/capture-route.ts',
  'workers/publisher/http.ts',
  'workers/publisher/index.ts',
  'workers/publisher/renderer-contract.ts',
  'workers/publisher/pdf-inspection.ts',
  'src/app/capture/publisher-diagnostics.ts',
] as const;

/**
 * Generated images are identified by their INGREDIENTS, not their encoder output: media/ source
 * bytes, the rules table, the generator script, and the pinned sharp version. All of these live in
 * git, so the digest is identical on every machine — which keeps `publisher:release:verify` a local
 * git-diff even though the served bytes are produced in CI (wayfinder #269). Encoder output is
 * deliberately never hashed: sharp makes no byte-stability promise across platforms.
 */
export const GENERATED_IMAGE_INGREDIENT_PATHS = [
  'src/shared/assetRules.ts',
  'scripts/generate-images.ts',
] as const;

function digestEntries(prefix: string, entries: RendererManifestEntry[]): string {
  const sorted = [...entries].sort((left, right) => left.path.localeCompare(right.path));
  const paths = new Set<string>();
  const hash = createHash('sha256');
  hash.update(`${prefix}\0`);
  for (const entry of sorted) {
    if (!entry.path || paths.has(entry.path)) {
      throw new Error('Renderer manifest paths must be unique');
    }
    paths.add(entry.path);
    hash.update(entry.path);
    hash.update('\0');
    hash.update(entry.bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

export type RendererManifestComponents = {
  /** Media/ source bytes (plus committed public/web/logo.svg). */
  sources: string;
  /** Generator script + rules table + pinned sharp version. */
  toolchain: string;
  /** Capture bundle + runtime closure output bytes (locally reproducible). */
  code: string;
  /** The PDF/viewport contract. */
  contract: string;
};

export function computeRendererManifestDigest(
  codeEntries: RendererManifestEntry[],
  sourceEntries: RendererManifestEntry[],
  toolchainEntries: RendererManifestEntry[],
  contract: unknown = PUBLISHER_RENDERER_CONTRACT
): { digest: string; components: RendererManifestComponents } {
  const components: RendererManifestComponents = {
    sources: digestEntries('faction-sheet-renderer-sources\0v1', sourceEntries),
    toolchain: digestEntries('faction-sheet-renderer-toolchain\0v1', toolchainEntries),
    code: digestEntries('faction-sheet-renderer-code\0v1', codeEntries),
    contract: createHash('sha256').update(JSON.stringify(contract)).digest('hex'),
  };
  const digest = createHash('sha256')
    .update('faction-sheet-renderer-manifest\0v2\0')
    .update(components.sources)
    .update('\0')
    .update(components.toolchain)
    .update('\0')
    .update(components.code)
    .update('\0')
    .update(components.contract)
    .digest('hex');
  return { digest, components };
}

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(candidate) : [candidate];
  });
}

export function isRendererManifestAsset(relativePath: string): boolean {
  const normalizedPath = relativePath.split(path.sep).join('/');
  return (
    normalizedPath !== '_shell.html' &&
    normalizedPath !== 'index.html' &&
    !normalizedPath.startsWith('__storybook/') &&
    !normalizedPath.startsWith('public/') &&
    // Generated image output is identified by ingredients, never by bytes.
    !normalizedPath.startsWith('image/') &&
    !normalizedPath.startsWith('web/')
  );
}

function entriesFor(repositoryRoot: string, files: string[]): RendererManifestEntry[] {
  return files.map((file) => ({
    path: path.relative(repositoryRoot, file).split(path.sep).join('/'),
    bytes: readFileSync(file),
  }));
}

function sharpVersionFrom(repositoryRoot: string): string {
  const manifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as {
    devDependencies?: Record<string, string>;
  };
  const version = manifest.devDependencies?.sharp;
  if (!version || /[\^~<>]/.test(version)) {
    throw new Error('sharp must be an exact-pinned devDependency for renderer identity');
  }
  return version;
}

export function writeRendererManifest(
  repositoryRoot: string,
  publisherDirectory: string
): { digest: string; entryCount: number } {
  const codeFiles = [
    ...filesBelow(publisherDirectory).filter((file) =>
      isRendererManifestAsset(path.relative(publisherDirectory, file))
    ),
    ...RENDERER_RUNTIME_CLOSURE_PATHS.map((relativePath) =>
      path.join(repositoryRoot, relativePath)
    ),
  ];
  const sourceFiles = [
    ...filesBelow(path.join(repositoryRoot, 'media')),
    path.join(repositoryRoot, 'public/web/logo.svg'),
  ];
  const toolchainEntries = [
    ...entriesFor(
      repositoryRoot,
      GENERATED_IMAGE_INGREDIENT_PATHS.map((relativePath) =>
        path.join(repositoryRoot, relativePath)
      )
    ),
    {
      path: 'toolchain/sharp-version',
      bytes: new TextEncoder().encode(sharpVersionFrom(repositoryRoot)),
    },
  ];

  const { digest, components } = computeRendererManifestDigest(
    entriesFor(repositoryRoot, codeFiles),
    entriesFor(repositoryRoot, sourceFiles),
    toolchainEntries
  );
  const { pdf, viewport } = PUBLISHER_RENDERER_CONTRACT;
  const contract = `{
    viewport: {
      width: ${viewport.width},
      height: ${viewport.height},
      deviceScaleFactor: ${viewport.deviceScaleFactor},
    },
    pdf: {
      pageCount: ${pdf.pageCount},
      pageWidthMm: ${pdf.pageWidthMm},
      pageHeightMm: ${pdf.pageHeightMm},
      pageSizeToleranceMm: ${pdf.pageSizeToleranceMm},
      displayHeaderFooter: ${pdf.displayHeaderFooter},
      marginMm: {
        top: ${pdf.marginMm.top},
        right: ${pdf.marginMm.right},
        bottom: ${pdf.marginMm.bottom},
        left: ${pdf.marginMm.left},
      },
      preferCssPageSize: ${pdf.preferCssPageSize},
      printBackground: ${pdf.printBackground},
    },
  }`;
  writeFileSync(
    path.join(repositoryRoot, 'workers/publisher/renderer-manifest.generated.ts'),
    `// Generated after assembling the complete publisher Static Assets release.\n` +
      `// Run \`bun run publisher:assets\` after changing Renderer assets or the PDF contract.\n` +
      `// Generated images are identified by ingredients (media/ + rules + generator +\n` +
      `// sharp version), so this file is reproducible on any machine (wayfinder #269).\n` +
      `export const rendererManifest = {\n` +
      `  schemaVersion: 2,\n` +
      `  rendererIdentity:\n` +
      `    'faction-sheet/sha256:${digest}',\n` +
      `  digest: '${digest}',\n` +
      `  components: {\n` +
      `    sources: '${components.sources}',\n` +
      `    toolchain: '${components.toolchain}',\n` +
      `    code: '${components.code}',\n` +
      `    contract: '${components.contract}',\n` +
      `  },\n` +
      `  contract: ${contract},\n` +
      `} as const;\n`
  );
  return { digest, entryCount: codeFiles.length + sourceFiles.length + toolchainEntries.length };
}
