import { execFileSync } from 'node:child_process';

/**
 * Names the Convex functions a build talks to, by the git trees of `convex/` and `src/shared/` (which those functions import).
 * The edge keeps public query answers under this name, so a deploy that does not touch either keeps them, and one that does starts afresh rather than handing new code an answer shaped by old functions.
 * A dirty or untracked tree, or no git at all, gets a name of its own, which shares nothing.
 */
export function convexSourceVersion(root: string): string {
  try {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    if (git('status', '--porcelain', '--', 'convex', 'src/shared') !== '') {
      return `local-${Date.now()}`;
    }
    return git('rev-parse', 'HEAD:convex', 'HEAD:src/shared')
      .split('\n')
      .map((tree) => tree.slice(0, 12))
      .join('-');
  } catch {
    return `local-${Date.now()}`;
  }
}
