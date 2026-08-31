import preview from '@sb/preview';
import { createRulebookEditorialStarterContents } from '@shared/rulebooks/fixtures';
import { rulebookNameKey } from '@shared/rulebooks/metadata';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { StorybookPage } from '../../-storybook';

function withRulebooks(baseline: StorybookDatabase) {
  const now = '2026-08-31T00:00:00.000Z';
  for (const [order, name] of ['Rules', 'Quick reference', 'Deleted Rulebook'].entries()) {
    const key = `rulebook:${order}`;
    baseline.rulebooks.push({
      $key: key,
      ruleset_id: ref('ruleset:classicrules'),
      name,
      name_key: rulebookNameKey(name),
      slug: `book-${order}`,
      sort_order: order,
      current_edition_number: 1,
      created_by: ref('storybook-viewer'),
      created_at: now,
      updated_at: now,
      is_deleted: order === 2,
      deleted_at: order === 2 ? now : null,
    });
    const contents = createRulebookEditorialStarterContents();
    baseline.rulebook_drafts.push({
      rulebook_id: ref(key),
      contents,
      revision: 1,
      updated_at: now,
      updated_by: ref('storybook-viewer'),
    });
    baseline.rulebook_editions.push({
      rulebook_id: ref(key),
      contents,
      edition_number: 1,
      created_at: now,
      created_by: ref('storybook-viewer'),
    });
  }
  baseline.users.push({ $key: 'member', name: 'Member' });
  baseline.users.push({ $key: 'outsider', name: 'Outsider' });
  baseline.group_members.push({
    group_id: ref('group:arrakeen-rules-council'),
    user_id: ref('member'),
    status: 'active',
    requested_at: now,
    approved_at: now,
    approved_by: ref('storybook-viewer'),
  });
  return baseline;
}

const meta = preview.meta({
  title: 'Rulesets/Rulebooks',
  component: StorybookPage,
  args: { path: '/rulesets/classicrules' },
  parameters: { layout: 'fullscreen', database: db(withRulebooks) },
});

export const Owner = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const list = await page.findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).queryByText('Deleted Rulebook')).toBeNull();
    expect(within(list).getAllByRole('img', { name: /First-page preview unavailable/ })).toHaveLength(2);
    expect(page.getByRole('link', { name: 'Add Rulebook' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/create'
    );
    expect(within(list).getByRole('link', { name: 'Edit Rules' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/book-0/edit'
    );
    expect(page.queryByRole('button', { name: /Move .* up/ })).toBeNull();
    expect(page.queryByRole('button', { name: /Rename/ })).toBeNull();
    expect(within(list).queryByRole('button', { name: /Delete/ })).toBeNull();
  },
});

export const Manage = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const list = await page.findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 });
    await userEvent.click(page.getByRole('button', { name: 'Move Quick reference up' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Quick reference'));
    expect(page.getByRole('button', { name: 'Move Quick reference up' })).toBeDisabled();
    expect(page.getByRole('button', { name: 'Delete Quick reference' })).toBeEnabled();
    expect(page.queryByRole('button', { name: /Rename/ })).toBeNull();
  },
});

export const Rename = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Rename Rulebook' }, { timeout: 30_000 }));
    const form = page.getByRole('form', { name: 'Rename Rulebook' });
    await userEvent.clear(within(form).getByRole('textbox', { name: 'Rulebook name' }));
    await userEvent.type(within(form).getByRole('textbox', { name: 'Rulebook name' }), 'Battle reference');
    expect(page.getByText(/bookmarks or shared links to the old one stop/)).toBeVisible();
    await userEvent.click(within(form).getByRole('button', { name: 'Rename Rulebook' }));
    await waitFor(() => expect(page.getByText('Battle reference', { exact: true })).toBeVisible());
    expect(page.queryByRole('textbox', { name: 'Rulebook name' })).toBeNull();
    expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    const title = page.getByRole('textbox', { name: 'Title' });
    await userEvent.type(title, ' revised');
    expect(page.getByRole('button', { name: 'Rename Rulebook' })).toBeDisabled();
  },
});

export const Empty = meta.story({ parameters: { database: db((baseline) => baseline) } });
export const RenameForm = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Rename Rulebook' }, { timeout: 30_000 }));
    expect(page.getByRole('textbox', { name: 'Rulebook name' })).toBeVisible();
  },
});
export const Narrow = meta.story({ globals: { viewport: { value: 'contentNarrow' } } });
export const Creation = meta.story({ args: { path: '/rulesets/classicrules/rulebooks/create' } });
export const Clone = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('radio', { name: 'Saved Rulebook' }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('combobox', { name: 'Rulebook to copy' }));
    const rules = await page.findByRole('option', { name: 'Rules' });
    expect(page.queryByRole('option', { name: 'Deleted Rulebook' })).toBeNull();
    await userEvent.click(rules);
    await userEvent.type(page.getByRole('textbox', { name: 'Rulebook name' }), 'Copied rules');
    await userEvent.click(page.getByRole('button', { name: 'Create Rulebook' }));
    await expect(page.findByRole('button', { name: 'Save' }, { timeout: 30_000 })).resolves.toBeDisabled();
    expect(page.getByText('Revision 1', { exact: true })).toBeVisible();
  },
});

export const ActiveMember = meta.story({
  parameters: { identity: { subjectKey: 'member', name: 'Member' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Add Rulebook' }, { timeout: 30_000 })).resolves.toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/create'
    );
    expect(page.queryByRole('button', { name: 'Move Quick reference up' })).toBeNull();
    expect(page.queryByRole('button', { name: 'Rename Rules' })).toBeNull();
    expect(page.queryByRole('button', { name: 'Delete Rules' })).toBeNull();
  },
});

export const MemberCreation = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: { identity: { subjectKey: 'member', name: 'Member' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await page.findByRole('textbox', { name: 'Rulebook name' }, { timeout: 30_000 }),
      'Member rules'
    );
    await userEvent.click(page.getByRole('button', { name: 'Create Rulebook' }));
    await expect(page.findByRole('button', { name: 'Save' }, { timeout: 30_000 })).resolves.toBeDisabled();
  },
});

export const MemberManagement = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  parameters: { identity: { subjectKey: 'member', name: 'Member' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('button', { name: 'Move Quick reference up' }, { timeout: 30_000 })
    ).resolves.toBeEnabled();
    expect(page.queryByRole('button', { name: 'Delete Rules' })).toBeNull();
  },
});

export const MemberEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: { identity: { subjectKey: 'member', name: 'Member' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Save' }, { timeout: 30_000 })).resolves.toBeDisabled();
    expect(page.queryByRole('button', { name: 'Rename Rulebook' })).toBeNull();
  },
});

export const Reader = meta.story({ parameters: { identity: null } });
export const ManageNarrow = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'contentNarrow' } },
});

async function expectDenied(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await expect(
    page.findByRole('heading', { name: 'Rulebook creation is unavailable' }, { timeout: 30_000 })
  ).resolves.toBeVisible();
  expect(page.queryByRole('textbox', { name: 'Rulebook name' })).toBeNull();
}

export const Outsider = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: { identity: { subjectKey: 'outsider', name: 'Outsider' } },
  play: async ({ canvasElement }) => expectDenied(canvasElement),
});
export const InactiveMember = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: {
    identity: { subjectKey: 'member', name: 'Member' },
    database: db((baseline) => {
      withRulebooks(baseline);
      baseline.group_members[baseline.group_members.length - 1].status = 'removed';
    }),
  },
  play: async ({ canvasElement }) => expectDenied(canvasElement),
});
export const SignedOut = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('textbox', { name: 'Rulebook name' })).toBeNull();
  },
});
