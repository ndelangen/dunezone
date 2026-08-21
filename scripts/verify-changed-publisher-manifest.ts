import { spawnSync } from 'node:child_process';
import type { SpawnSyncOptions } from 'node:child_process';

import { isRendererManifestInputPath } from '../workers/publisher/renderer-manifest-build';

const rendererManifestPath = 'workers/publisher/renderer-manifest.generated.ts';

function run(command: string, arguments_: string[], options: SpawnSyncOptions = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    encoding: 'utf8',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function parseBaseArgument(arguments_: string[]): string | undefined {
  if (arguments_.length === 0) {
    return undefined;
  }
  if (arguments_.length === 1 && arguments_[0].startsWith('--base=')) {
    return arguments_[0].slice('--base='.length);
  }
  if (arguments_.length === 2 && arguments_[0] === '--base') {
    return arguments_[1];
  }
  throw new Error('Usage: verify-changed-publisher-manifest [--base <git-ref>]');
}

function resolveBaseRef(explicitBase: string | undefined): string {
  const candidates = explicitBase
    ? [explicitBase]
    : [process.env.PUBLISHER_MANIFEST_BASE_REF, 'real-origin/main', 'origin/main', 'main'].filter(
        (candidate): candidate is string => Boolean(candidate)
      );

  for (const candidate of candidates) {
    const result = run('git', ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`]);
    if (result.status === 0) {
      return candidate;
    }
  }

  throw new Error(
    'Cannot find the main-branch ref. Fetch main or set PUBLISHER_MANIFEST_BASE_REF before running this check.'
  );
}

function gitOutput(arguments_: string[]): string {
  const result = run('git', arguments_);
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString().trim() || `git ${arguments_.join(' ')} failed`);
  }
  return result.stdout?.toString().trim() ?? '';
}

function main() {
  const explicitBase = parseBaseArgument(process.argv.slice(2));
  const baseRef = resolveBaseRef(explicitBase);
  const mergeBase = gitOutput(['merge-base', 'HEAD', baseRef]);
  const changedPaths = gitOutput(['diff', '--name-only', '--diff-filter=ACDMRTUXB', mergeBase, '--'])
    .split('\n')
    .filter(Boolean);
  const captureBundleChanged = changedPaths.some(isRendererManifestInputPath);

  if (!captureBundleChanged) {
    console.log(`Publisher manifest check skipped: no capture-bundle changes since ${baseRef}.`);
    return;
  }

  console.log(`Capture-bundle changes found since ${baseRef}; verifying the tracked Renderer manifest.`);
  const dryRun = run('bun', ['run', 'publisher:dry-run'], { stdio: 'inherit' });
  if (dryRun.status !== 0) {
    process.exit(dryRun.status ?? 1);
  }

  const manifestDiff = run('git', ['diff', '--exit-code', '--', rendererManifestPath], { stdio: 'inherit' });
  if (manifestDiff.status === 0) {
    return;
  }

  console.error(
    `Publisher manifest is stale. Run \`bun run publisher:dry-run\`, commit \`${rendererManifestPath}\`, and rerun \`bun run check\`.`
  );
  process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
