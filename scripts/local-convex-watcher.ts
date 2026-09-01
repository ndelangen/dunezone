import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import path from 'node:path';

import { pushCode } from './provision';

export type LocalConvexChange = 'ignore' | 'push' | 'restart';

type LocalConvexPushCoordinatorOptions = {
  push: () => Promise<void> | void;
  onPushStarted?: () => void;
  onPushSucceeded?: () => void;
  onPushFailed?: (error: unknown) => void;
  onRestartRequired?: () => void;
};

type LocalConvexPathRule =
  | { directory: string; change: LocalConvexChange }
  | { pattern: RegExp; change: LocalConvexChange };

const rootDirectory = path.resolve(import.meta.dirname, '..');
const rootConfigurationFiles = new Set(['convex.json', 'package.json', 'tsconfig.json']);
const localConvexPathRules = [
  { directory: 'convex/_generated', change: 'ignore' },
  { pattern: /^convex\/migrations.*\.ts$/, change: 'restart' },
  { directory: 'convex', change: 'push' },
  { directory: 'src/shared', change: 'push' },
] satisfies ReadonlyArray<LocalConvexPathRule>;

function normalizedRelativePath(relativePath: string) {
  return relativePath.replaceAll('\\', '/').replace(/^\.\//, '');
}

function matchesPathRule(rule: LocalConvexPathRule, file: string) {
  if ('pattern' in rule) {
    return rule.pattern.test(file);
  }
  return file === rule.directory || file.startsWith(`${rule.directory}/`);
}

export function classifyLocalConvexChange(relativePath: string): LocalConvexChange {
  const file = normalizedRelativePath(relativePath);
  if (file === 'convex/migration-guards.json') {
    return 'restart';
  }
  const rule = localConvexPathRules.find((candidate) => matchesPathRule(candidate, file));
  if (rule) {
    return rule.change;
  }
  return rootConfigurationFiles.has(file) ? 'push' : 'ignore';
}

export function classifyLocalConvexRootChange(filename: string | null): LocalConvexChange {
  if (filename === null) {
    return 'restart';
  }
  return rootConfigurationFiles.has(normalizedRelativePath(filename)) ? 'push' : 'ignore';
}

export function createLocalConvexPushCoordinator(options: LocalConvexPushCoordinatorOptions) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pushIsRunning = false;
  let pushIsQueued = false;
  let restartIsRequired = false;
  let stopped = false;

  const clearPendingPush = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const schedulePush = () => {
    clearPendingPush();
    timer = setTimeout(() => {
      timer = undefined;
      void runPush();
    }, 150);
  };

  const runPush = async () => {
    if (stopped || restartIsRequired) {
      return;
    }
    pushIsRunning = true;
    options.onPushStarted?.();
    try {
      await options.push();
      options.onPushSucceeded?.();
    } catch (error) {
      options.onPushFailed?.(error);
    } finally {
      pushIsRunning = false;
      if (pushIsQueued) {
        pushIsQueued = false;
        schedulePush();
      }
    }
  };

  return {
    record(change: LocalConvexChange) {
      if (stopped || change === 'ignore') {
        return;
      }
      if (change === 'restart') {
        clearPendingPush();
        pushIsQueued = false;
        if (!restartIsRequired) {
          restartIsRequired = true;
          options.onRestartRequired?.();
        }
        return;
      }
      if (restartIsRequired) {
        return;
      }
      if (pushIsRunning) {
        pushIsQueued = true;
        return;
      }
      schedulePush();
    },
    stop() {
      stopped = true;
      pushIsQueued = false;
      clearPendingPush();
    },
  };
}

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`The local Convex watcher requires ${name}`);
  }
  return value;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function main() {
  const deployment = {
    kind: 'self-hosted' as const,
    url: requiredEnvironmentValue('CONVEX_SELF_HOSTED_URL'),
    adminKey: requiredEnvironmentValue('CONVEX_SELF_HOSTED_ADMIN_KEY'),
  };
  const coordinator = createLocalConvexPushCoordinator({
    push: () => pushCode(deployment, process.env),
    onPushStarted: () => console.log('Pushing local Convex changes...'),
    onPushSucceeded: () => console.log('Local Convex changes are live.'),
    onPushFailed: (error) =>
      console.error(`Local Convex push failed. Fix the backend change to retry: ${errorMessage(error)}`),
    onRestartRequired: () => {
      console.error(
        'A Convex migration file changed. Restart bun run app:dev --local to rebuild the database and rerun migration guards. This watcher will not push more changes.'
      );
    },
  });
  const watchers: FSWatcher[] = [];
  let stopped = false;

  const close = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    coordinator.stop();
    for (const watcher of watchers) {
      watcher.close();
    }
  };
  const fail = (error: unknown) => {
    if (stopped) {
      return;
    }
    console.error(`Local Convex watcher failed: ${errorMessage(error)}`);
    close();
    process.exit(1);
  };
  const stop = (exitCode: number) => {
    close();
    process.exit(exitCode);
  };
  process.once('SIGINT', () => stop(130));
  process.once('SIGTERM', () => stop(143));
  process.once('exit', close);

  const addWatcher = (watcher: FSWatcher) => {
    watchers.push(watcher);
    watcher.once('error', fail);
  };
  const recordNestedChange = (prefix: 'convex' | 'src/shared', filename: string | null) => {
    if (filename === null) {
      coordinator.record(prefix === 'convex' ? 'restart' : 'push');
      return;
    }
    coordinator.record(classifyLocalConvexChange(`${prefix}/${filename}`));
  };

  try {
    addWatcher(
      watch(path.join(rootDirectory, 'convex'), { recursive: true, encoding: 'utf8' }, (_event, filename) => {
        recordNestedChange('convex', filename);
      })
    );
    addWatcher(
      watch(path.join(rootDirectory, 'src/shared'), { recursive: true, encoding: 'utf8' }, (_event, filename) => {
        recordNestedChange('src/shared', filename);
      })
    );
    addWatcher(
      watch(rootDirectory, { encoding: 'utf8' }, (_event, filename) => {
        coordinator.record(classifyLocalConvexRootChange(filename));
      })
    );
  } catch (error) {
    fail(error);
  }

  console.log('Local Convex watcher is ready.');
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}
