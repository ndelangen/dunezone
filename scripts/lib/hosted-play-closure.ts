/*
 * The files a pull request must touch for the hosted play flows to be able to observe the change (#1598).
 * The globs name the game and publisher Workers, the backend, the shared modules, the play pages and the app code they import, the launcher with its flows, and the builds, generators and checks it runs as subprocesses with the configuration they read.
 * `scripts/hosted-play-closure.test.ts` holds the list to the import graph: a file the play entry points or the launcher's subprocess inputs import from outside these globs fails the unit job, so the list widens with the code rather than drifting from it.
 * What the flows consume without importing is listed by hand: the workflow and action files, the dependency manifest with its lockfile and patches, the Convex project file, the compose file, and the tracked files under `public` the pages load by URL (the generated output there is ignored by git and never appears in a diff).
 * Most `media` stays out: the flows play a synthetic catalogue built from the fixtures under `src/shared`, and the `generate_and_build` job checks the generators against the media on every pull request.
 * The spice mask is imported directly into the rulebook export module, so its source belongs to the imported closure.
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
  'coverage-denominator.ts',
  'browser-launch-tests.ts',
  'docker-compose.convex-local.yml',
  'patches/**',
  'convex.json',
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
  'scripts/lib/publisher-assets.ts',
  'scripts/lib/application-assets.ts',
  'scripts/lib/reactCompiler.ts',
  'scripts/lib/threeRendererStack.ts',
  'scripts/generate.ts',
  'scripts/generate-*',
  'scripts/assemble-publisher-assets.ts',
  'scripts/verify-rulebook-html-runtime.ts',
  'scripts/workerd-exit-record.mjs',
  'publisher-capture.html',
  'src/app/print/**',
  'src/shared/**',
  'src/app/router.tsx',
  'src/app/routes/start.ts',
  'src/app/routes/__root.tsx',
  'src/app/routes/pageTitle.ts',
  'src/app/routes/publicPage.ts',
  'src/app/routes/_app/route.tsx',
  'src/app/routes/_app/auth/**',
  'src/app/routes/_app/play/**',
  'src/app/routes/_app/index.tsx',
  'src/app/routes/_app/index.module.css',
  'src/app/routes/_app/homepage/**',
  'src/app/db/**',
  'src/app/shell/**',
  'src/app/styles/**',
  'src/app/ui/**',
  'src/app/widgets/page-message/**',
  'src/app/widgets/tabletop/**',
  'src/app/widgets/asset-face/**',
  'src/game/assets/**',
  'src/game/data/**',
  'src/game/fixtures/**',
  'src/game/rulebook/**',
  'public/**',
  'media/vector/icon/spice.svg',
  'media/vector/icon/arrakis-city.svg',
  'media/vector/icon/arrakis-sietch.svg',
  'media/vector/icon/city.svg',
  'media/vector/icon/seitch.svg',
  'media/vector/icon/ornithopter.svg',
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
