import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  PUBLISHER_RENDERER_CONTRACT,
  PUBLISHER_RENDERER_VERSION,
  PUBLISHER_SUPPORTED_RENDERER_VERSIONS,
} from './renderer-contract';

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
  'src/app/capture/faction-sheet-renderer-versions.ts',
] as const;

export function computeRendererManifestDigest(
  entries: RendererManifestEntry[],
  contract: unknown = PUBLISHER_RENDERER_CONTRACT
): string {
  const sorted = [...entries].sort((left, right) => left.path.localeCompare(right.path));
  const paths = new Set<string>();
  const hash = createHash('sha256');
  hash.update('faction-sheet-renderer-manifest\0v1\0');
  hash.update(JSON.stringify(contract));
  hash.update('\0');
  for (const entry of sorted) {
    if (!entry.path || paths.has(entry.path))
      throw new Error('Renderer manifest paths must be unique');
    paths.add(entry.path);
    hash.update(entry.path);
    hash.update('\0');
    hash.update(entry.bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(candidate) : [candidate];
  });
}

export function writeRendererManifest(
  repositoryRoot: string,
  publisherDirectory: string
): { digest: string; entryCount: number } {
  const files = [
    ...filesBelow(publisherDirectory),
    ...RENDERER_RUNTIME_CLOSURE_PATHS.map((relativePath) =>
      path.join(repositoryRoot, relativePath)
    ),
  ];
  const digest = computeRendererManifestDigest(
    files.map((file) => ({
      path: path.relative(repositoryRoot, file).split(path.sep).join('/'),
      bytes: readFileSync(file),
    }))
  );
  const { pdf, viewport } = PUBLISHER_RENDERER_CONTRACT;
  const contract = `{
    rendererVersion: '${PUBLISHER_RENDERER_VERSION}',
    supportedRendererVersions: [${PUBLISHER_SUPPORTED_RENDERER_VERSIONS.map((version) => `'${version}'`).join(', ')}],
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
      `// Run \`bun run publisher:assets\` after changing release assets or the PDF contract.\n` +
      `export const rendererManifest = {\n` +
      `  schemaVersion: 1,\n` +
      `  rendererVersion: '${PUBLISHER_RENDERER_VERSION}',\n` +
      `  supportedRendererVersions: [${PUBLISHER_SUPPORTED_RENDERER_VERSIONS.map((version) => `'${version}'`).join(', ')}],\n` +
      `  rendererId:\n` +
      `    'faction-sheet/sha256:${digest}',\n` +
      `  digest: '${digest}',\n` +
      `  contract: ${contract},\n` +
      `} as const;\n`
  );
  return { digest, entryCount: files.length };
}
