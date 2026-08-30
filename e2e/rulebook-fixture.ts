import { ConvexHttpClient } from 'convex/browser';

import { api } from '../convex/_generated/api';

export async function seedRulebookEditor(includeMember = true) {
  const client = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL ?? 'http://127.0.0.1:3210');
  const fixture = await client.mutation(api.e2e.seedRulebookEditor, {
    ownerEmail: process.env.PLAYWRIGHT_USER_A_EMAIL!,
    memberEmail: process.env.PLAYWRIGHT_USER_B_EMAIL!,
    slug: `rulebook-${crypto.randomUUID()}`,
    includeMember,
  });
  return { ...fixture, path: `/rulesets/${fixture.rulesetSlug}/rulebooks/${fixture.rulebookSlug}/edit` };
}
