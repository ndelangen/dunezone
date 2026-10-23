/* The Ruleset's Rulebooks page, the reader and the edition history, as the owner, a member, a reader and a signed-out visitor see them (#1590). */
import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { db } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { expectWithinWidth } from '../../pagePlay';
import { rulebooksMeta, withRulebooks, withSizedRulebooks } from './rulebooks.stories.fixture';

const meta = preview.meta({
  ...rulebooksMeta,
  title: 'Rulesets/Rulebooks',
});

function withManyRulebooks(baseline: StorybookDatabase) {
  return withRulebooks(baseline, ['Rules', 'Quick reference', 'Deleted Rulebook', 'Battle reference', 'Appendices']);
}

/** The Rulebook cards once the list has loaded. */
async function findCards(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const list = await page.findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 });
  return within(list).getAllByRole('listitem');
}

/** Five Rulebooks, one deleted, so the grid holds four cards. */
export const Grid = meta.story({
  parameters: { database: db(withManyRulebooks) },
  globals: { viewport: { value: 'appAuthoringWide' } },
  play: async ({ canvasElement }) => {
    await expect(findCards(canvasElement)).resolves.toHaveLength(4);
  },
});

/** On a phone the four cards wrap onto more than one row and stay inside the width. */
export const GridNarrow = meta.story({
  parameters: { database: db(withManyRulebooks) },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const cards = await findCards(canvasElement);
    await expect(cards).toHaveLength(4);
    const rows = new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top)));
    await expect(rows.size).toBeGreaterThan(1);
    await expectWithinWidth(canvasElement, cards);
  },
});

export const Viewer = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-1' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('region', { name: 'Quick reference contents' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.getByText('Edition 1', { exact: true })).toBeVisible();
    await expect(page.getAllByRole('article', { name: /Rulebook page:/ })).toHaveLength(3);
    await expect(page.queryByRole('button', { name: 'Save' })).toBeNull();
    await expect(page.queryByRole('button', { name: 'Delete Rulebook' })).toBeNull();
    await expect(page.queryByRole('link', { name: 'Edit Rulebook' })).toBeNull();
  },
});

export const MemberReader = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0' },
  parameters: { identity: { subjectKey: 'member', name: 'Member' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('region', { name: 'Rules contents' }, { timeout: 30_000 });
    /* The links follow the viewer, which the browser resolves after the shared page, so wait for them. */
    const edit = await page.findByRole('link', { name: 'Edit Rulebook' }, { timeout: 30_000 });
    await expect(edit).toHaveAttribute('href', '/rulesets/classicrules/rulebooks/book-0/edit');
    await expect(page.queryByRole('button', { name: 'Delete Rulebook' })).toBeNull();
  },
});

/** The signed-out reader on a phone: every page fits the width. */
export const ViewerNarrow = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0' },
  parameters: { identity: null },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('region', { name: 'Rules contents' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expectWithinWidth(canvasElement, page.getAllByRole('article', { name: /Rulebook page:/ }));
  },
});

export const EditionHistorySingle = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/editions' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Rules', level: 1 }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByText('1 Edition')).toBeVisible();
    const list = within(page.getByRole('list', { name: 'Editions' }));
    await expect(list.getAllByRole('listitem')).toHaveLength(1);
    await expect(list.getByText('Current')).toBeVisible();
    await expect(list.getByRole('link', { name: 'Read Edition 1' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/book-0'
    );
  },
});

export const EditionHistoryDeleted = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-2/editions' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Rulebook not found', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('list', { name: 'Editions' })).not.toBeInTheDocument();
  },
});

export const ViewerDeleted = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-2' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Page not found' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('article', { name: /Rulebook page:/ })).toBeNull();
  },
});

/** A ruleset with no Rulebooks says so, and its owner can still add one. */
export const Empty = meta.story({
  parameters: { database: db((baseline) => baseline) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText('No Rulebooks yet. Add one from the toolbar.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Add Rulebook' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('list', { name: 'Rulebooks' })).toBeNull();
  },
});

/** A square Rulebook and a tall one: each card takes its own Rulebook's proportions. */
export const MixedSizes = meta.story({
  parameters: { database: db(withSizedRulebooks) },
  play: async ({ canvasElement }) => {
    await findCards(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const ratio = (name: string) => {
      const { width, height } = page
        .getByRole('img', { name: `First page of ${name}: preview unavailable` })
        .getBoundingClientRect();
      return height / width;
    };
    await expect(ratio('Rules')).toBeCloseTo(1, 1);
    await expect(ratio('Quick reference')).toBeCloseTo(297 / 105, 1);
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
    await expect(page.queryByRole('button', { name: 'Move Quick reference up' })).toBeNull();
    await expect(page.queryByRole('button', { name: 'Rename Rules' })).toBeNull();
    await expect(page.queryByRole('button', { name: 'Delete Rules' })).toBeNull();
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
    await expect(page.queryByRole('button', { name: 'Delete Rules' })).toBeNull();
    await expect(page.getByText('Only the ruleset owner can rename it.')).toBeVisible();
  },
});

export const Reader = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const list = await page.findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 });
    await expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    /* The history is a read path, so a signed-out reader gets the card menu too, minus the editing entries. */
    await expect(within(list).getAllByRole('button')).toHaveLength(2);
    await userEvent.click(within(list).getByRole('button', { name: 'Actions for Rules' }));
    await expect(waitForFrame(() => page.getByRole('menuitem', { name: 'Editions' }))).resolves.toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/book-0/editions'
    );
    await expect(page.getByRole('menuitem', { name: 'Open HTML' })).toHaveAttribute('target', '_blank');
    await expect(page.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
  },
});

/** The manage list at 260 px keeps its reorder and delete controls inside the width. */
export const ManageNarrow = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'contentNarrow' } },
  play: async ({ canvasElement }) => {
    const list = within(
      await within(canvasElement.ownerDocument.body).findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 })
    );
    const controls = list.getAllByRole('button', { name: /^(Move|Delete) / });
    await expect(controls.length).toBeGreaterThan(0);
    await expectWithinWidth(canvasElement, controls);
  },
});
