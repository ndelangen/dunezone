import { slugify } from '../convex/lib/utils';

/**
 * The seeded accounts, derived the way `convex/e2e.ts` derives them: the username is the address's local part, and the profile slug is that username slugified.
 * The two differ for any address holding a character a slug cannot (a dot, a plus, an uppercase letter), so a spec that rebuilds either by hand is one address away from asserting a path the app never routes to.
 * Deriving both here, from the same `slugify` the seed calls, keeps them from drifting apart.
 */
function seededAccount(email: string) {
  const username = email.trim().toLowerCase().split('@')[0] ?? 'e2e-user';
  const slugBase = slugify(username);
  return { username, slug: slugBase.length > 0 ? slugBase : 'e2e-user' };
}

export const userA = seededAccount(process.env.PLAYWRIGHT_USER_A_EMAIL ?? 'e2e-user-a@example.com');
export const accountDeleteUser = seededAccount(
  process.env.PLAYWRIGHT_ACCOUNT_DELETE_EMAIL ?? 'e2e-account-delete@example.com'
);
