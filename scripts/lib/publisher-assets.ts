import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const WORKERS_FREE_STATIC_ASSET_LIMIT = 20_000;
export const WORKERS_STATIC_ASSET_FILE_LIMIT_BYTES = 25 * 1024 * 1024;

export type PublisherAssetReport = {
  assetCount: number;
  storyCount: number;
  totalBytes: number;
  largestAsset: { path: string; bytes: number };
};

const STORYBOOK_REQUIRED_ASSETS = [
  '__storybook/index.html',
  '__storybook/iframe.html',
  '__storybook/index.json',
] as const;
const STORYBOOK_FORBIDDEN_RUNTIME_REFERENCES = [
  '/generated/',
  '.convex.cloud',
  '.convex.site',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
] as const;
const STORYBOOK_TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json']);

export function normalizePublisherShell(shell: string): string {
  return shell.replace(
    /(i:"__root__\0",u:)\d+(,s:"success",ssr:!0)/g,
    (_match, prefix: string, suffix: string) => `${prefix}0${suffix}`
  );
}

function assertDirectory(directory: string, label: string) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`${label} directory is missing: ${directory}`);
  }
}

function filesBelow(root: string): Array<{ path: string; bytes: number }> {
  const files: Array<{ path: string; bytes: number }> = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isSymbolicLink() || lstatSync(absolute).isSymbolicLink()) {
        throw new Error(`Static Assets cannot include a symbolic link: ${relative}`);
      }
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push({ path: relative, bytes: statSync(absolute).size });
    }
  };
  visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function inspectPublisherAssets(directory: string): PublisherAssetReport {
  assertDirectory(directory, 'Publisher Static Assets');
  const files = filesBelow(directory);
  if (files.length === 0) throw new Error('Publisher Static Assets directory is empty');
  if (files.length > WORKERS_FREE_STATIC_ASSET_LIMIT) {
    throw new Error(
      `Publisher Static Assets exceed the Workers Free file limit: ${files.length} > ${WORKERS_FREE_STATIC_ASSET_LIMIT}`
    );
  }

  const oversized = files.find((file) => file.bytes > WORKERS_STATIC_ASSET_FILE_LIMIT_BYTES);
  if (oversized) {
    throw new Error(
      `Publisher Static Asset exceeds 25 MiB: ${oversized.path} (${oversized.bytes} bytes)`
    );
  }

  const paths = new Set(files.map((file) => file.path));
  for (const required of ['_shell.html', 'index.html', 'publisher-capture.html']) {
    if (!paths.has(required)) throw new Error(`Publisher Static Assets are missing ${required}`);
  }
  if (![...paths].some((file) => file.startsWith('public/'))) {
    throw new Error('Publisher Static Assets are missing the application bundle');
  }
  if (![...paths].some((file) => file.startsWith('publisher-capture/'))) {
    throw new Error('Publisher Static Assets are missing the capture bundle');
  }
  for (const required of STORYBOOK_REQUIRED_ASSETS) {
    if (!paths.has(required)) throw new Error(`Publisher Static Assets are missing ${required}`);
  }
  if (![...paths].some((file) => file.startsWith('__storybook/assets/'))) {
    throw new Error('Publisher Static Assets are missing the Storybook preview bundle');
  }

  const storyIndex = JSON.parse(
    readFileSync(path.join(directory, '__storybook/index.json'), 'utf8')
  ) as { entries?: Record<string, { type?: string }> };
  const storyCount = Object.values(storyIndex.entries ?? {}).filter(
    (entry) => entry.type === 'story'
  ).length;
  if (storyCount === 0) throw new Error('Publisher Storybook index contains no stories');

  for (const file of files) {
    if (
      !file.path.startsWith('__storybook/') ||
      !STORYBOOK_TEXT_EXTENSIONS.has(path.extname(file.path))
    ) {
      continue;
    }
    const content = readFileSync(path.join(directory, file.path), 'utf8');
    const forbidden = STORYBOOK_FORBIDDEN_RUNTIME_REFERENCES.find((value) =>
      content.includes(value)
    );
    if (forbidden) {
      throw new Error(
        `Published Storybook asset ${file.path} contains forbidden runtime reference ${forbidden}`
      );
    }
  }
  const shell = readFileSync(path.join(directory, '_shell.html'));
  const index = readFileSync(path.join(directory, 'index.html'));
  if (!shell.equals(index)) {
    throw new Error('Worker index.html must be an exact copy of the TanStack SPA shell');
  }

  const largestAsset = files.reduce((largest, file) =>
    file.bytes > largest.bytes ? file : largest
  );
  return {
    assetCount: files.length,
    storyCount,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    largestAsset,
  };
}

export function assemblePublisherAssets(
  appDirectory: string,
  publisherDirectory: string,
  storybookDirectory: string
): PublisherAssetReport {
  assertDirectory(appDirectory, 'Application build');
  assertDirectory(publisherDirectory, 'Publisher capture build');
  assertDirectory(storybookDirectory, 'Storybook build');

  const storybookDestination = path.join(publisherDirectory, '__storybook');
  if (existsSync(storybookDestination)) {
    throw new Error(`Storybook destination already exists: ${storybookDestination}`);
  }

  for (const entry of readdirSync(appDirectory, { withFileTypes: true })) {
    cpSync(path.join(appDirectory, entry.name), path.join(publisherDirectory, entry.name), {
      recursive: entry.isDirectory(),
      force: true,
    });
  }
  if (existsSync(storybookDestination)) {
    throw new Error('Application build conflicts with the reserved __storybook asset namespace');
  }
  cpSync(storybookDirectory, storybookDestination, { recursive: true, force: false });

  const shell = path.join(publisherDirectory, '_shell.html');
  if (!existsSync(shell)) throw new Error('Application build is missing the TanStack SPA shell');
  const normalizedShell = normalizePublisherShell(readFileSync(shell, 'utf8'));
  writeFileSync(shell, normalizedShell);
  copyFileSync(shell, path.join(publisherDirectory, 'index.html'));
  return inspectPublisherAssets(publisherDirectory);
}
