import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

export const WORKERS_FREE_STATIC_ASSET_LIMIT = 20_000;
export const WORKERS_STATIC_ASSET_FILE_LIMIT_BYTES = 25 * 1024 * 1024;

export type PublisherAssetReport = {
  assetCount: number;
  totalBytes: number;
  largestAsset: { path: string; bytes: number };
};

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
  if (paths.has('_redirects')) {
    throw new Error('Netlify _redirects must not be included in the Worker release unit');
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
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    largestAsset,
  };
}

export function assemblePublisherAssets(
  appDirectory: string,
  publisherDirectory: string
): PublisherAssetReport {
  assertDirectory(appDirectory, 'Application build');
  assertDirectory(publisherDirectory, 'Publisher capture build');

  for (const entry of readdirSync(appDirectory, { withFileTypes: true })) {
    if (entry.name === '_redirects') continue;
    cpSync(path.join(appDirectory, entry.name), path.join(publisherDirectory, entry.name), {
      recursive: entry.isDirectory(),
      force: true,
    });
  }

  const shell = path.join(publisherDirectory, '_shell.html');
  if (!existsSync(shell)) throw new Error('Application build is missing the TanStack SPA shell');
  copyFileSync(shell, path.join(publisherDirectory, 'index.html'));
  return inspectPublisherAssets(publisherDirectory);
}
