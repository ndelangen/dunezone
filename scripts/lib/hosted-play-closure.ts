/*
 * The files a pull request must touch for the hosted play flows to be able to observe the change (#1598).
 * The globs name the game and publisher Workers, the backend, the shared modules, the play pages and the app code they import, the launcher with its flows, and the tooling that builds or runs them.
 * `scripts/hosted-play-closure.test.ts` holds the list to the import graph: a file the play entry points import from outside these globs fails the unit job, so the list widens with the code rather than drifting from it.
 */
const HOSTED_PLAY_CLOSURE: readonly string[] = [
  '.github/workflows/ci-pr.yml',
  '.github/workflows/reusable-verify.yml',
  '.github/actions/**',
  'package.json',
  'bun.lock',
  'bunfig.toml',
  'tsconfig.json',
  'vite.config.ts',
  'docker-compose.convex-local.yml',
  'convex/**',
  'workers/game/**',
  'workers/publisher/**',
  'scripts/hosted-play-closure.ts',
  'scripts/lib/hosted-play-closure.ts',
  'scripts/verify-hosted-*',
  'scripts/play-local.ts',
  'scripts/play-load/**',
  'scripts/lib/isolated-stack.ts',
  'scripts/lib/synthetic-accounts.ts',
  'scripts/node-executable.ts',
  'src/shared/**',
  'src/app/router.tsx',
  'src/app/routes/__root.tsx',
  'src/app/routes/pageTitle.ts',
  'src/app/routes/_app/route.tsx',
  'src/app/routes/_app/auth/**',
  'src/app/routes/_app/play/**',
  'src/app/db/**',
  'src/app/shell/**',
  'src/app/styles/**',
  'src/app/ui/**',
  'src/app/widgets/page-message/**',
  'src/game/assets/**',
  'src/game/data/**',
  'src/game/fixtures/**',
  'public/font/**',
];

/** Files no hosted flow can observe wherever they sit: tests, stories, prose. */
const NEVER_REACHES_HOSTED_PLAY: readonly string[] = ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/*.md'];

/** A glob with `**`, `*` and `?` as a regular expression over a repository path. */
export function globToRegExp(glob: string): RegExp {
  let source = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*' && glob[index + 1] === '*') {
      index += 1;
      if (glob[index + 1] === '/') {
        index += 1;
        source += '(?:.*/)?';
      } else {
        source += '.*';
      }
    } else if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += character.replace(/[.+^${}()|[\]\\]/gu, '\\$&');
    }
  }
  return new RegExp(`${source}$`, 'u');
}

const closure = HOSTED_PLAY_CLOSURE.map(globToRegExp);
const never = NEVER_REACHES_HOSTED_PLAY.map(globToRegExp);

/** Whether the hosted play flows can observe a change to this file. */
export function reachesHostedPlay(file: string): boolean {
  return closure.some((pattern) => pattern.test(file)) && !never.some((pattern) => pattern.test(file));
}

/** What the hosted play shards do for a pull request that changed these files, and why. */
export function decideHostedPlay(changed: readonly string[]): { run: boolean; reaching: string[]; reason: string } {
  if (changed.length === 0) {
    return { run: true, reaching: [], reason: 'No changed file was read, so the shards run.' };
  }
  const reaching = changed.filter(reachesHostedPlay);
  return reaching.length > 0
    ? {
        run: true,
        reaching,
        reason: `${reaching.length} of ${changed.length} changed files can reach the hosted play flows.`,
      }
    : { run: false, reaching, reason: `None of the ${changed.length} changed files can reach the hosted play flows.` };
}
