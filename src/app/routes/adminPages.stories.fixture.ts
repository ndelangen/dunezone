import { expect, within } from 'storybook/test';

import { db } from '@db/storybook';

/** The baseline database with nobody holding the administrative role, for an admin page reached by an ordinary member. */
export const withoutAdmins = {
  database: db((baseline) => {
    for (const user of baseline.users) {
      user.isAdmin = false;
    }
  }),
};

/** An admin page turned a member away: its refusal shows, and the dashboard control it guards never does. */
export async function expectRefused(
  canvasElement: HTMLElement,
  heading: string,
  hidden: { role: 'button' | 'combobox'; name: string }
) {
  const page = within(canvasElement.ownerDocument.body);
  await expect(page.findByRole('heading', { name: heading }, { timeout: 30_000 })).resolves.toBeVisible();
  expect(page.queryByRole(hidden.role, { name: hidden.name })).toBeNull();
}
