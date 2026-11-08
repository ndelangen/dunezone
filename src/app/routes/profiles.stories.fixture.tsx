import { expect, within } from 'storybook/test';

import { faction, ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

/** The deletion page once loaded, with its delete control held back until the outcome is acknowledged. */
export async function findDeletionPage(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await expect(
    page.findByRole('heading', { name: 'Delete account', level: 1 }, { timeout: 30_000 })
  ).resolves.toBeVisible();
  await expect(page.findByRole('button', { name: 'Delete account' }, { timeout: 30_000 })).resolves.toBeDisabled();
  return page;
}

/** Seven makers with one to seven factions each, and eight Groups of shrinking size, so both boards fill and the Groups list has more to load. */
export function seedLeaderboards(baseline: StorybookDatabase) {
  const makers = ['Irulan', 'Stilgar', 'Chani', 'Gurney', 'Thufir', 'Jessica', 'Duncan'];
  makers.forEach((name, index) => {
    const key = `maker-${index}`;
    baseline.users.push({ $key: key, name });
    baseline.profiles.push({
      user_id: ref(key),
      username: name,
      slug: name.toLowerCase(),
      avatar_url: null,
      account_state: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    for (let count = 0; count <= index; count += 1) {
      baseline.factions.push({ ...faction({ name: `${name} House ${count + 1}` }), owner_id: ref(key) });
    }
  });
  for (let index = 0; index < 8; index += 1) {
    const key = `leaderboard-group-${index}`;
    baseline.groups.push({
      $key: key,
      name: `Sietch ${index + 1}`,
      slug: `sietch-${index + 1}`,
      created_at: '2026-01-01T00:00:00Z',
      created_by: ref(`maker-${index % makers.length}`),
      is_deleted: false,
    });
    for (const member of makers.slice(0, makers.length - index)) {
      baseline.group_members.push({
        group_id: ref(key),
        user_id: ref(`maker-${makers.indexOf(member)}`),
        status: 'active',
        requested_at: '2026-01-01T00:00:00Z',
        approved_at: '2026-01-01T00:00:00Z',
        approved_by: ref(`maker-${index % makers.length}`),
      });
    }
  }
}
