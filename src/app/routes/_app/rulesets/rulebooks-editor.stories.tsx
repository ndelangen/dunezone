import preview from '@sb/preview';
import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import { createRulebookStarterContents } from '@shared/rulebooks/fixtures';
import { expect, within } from 'storybook/test';

import { db } from '@db/storybook';
import { parseClientBoundary } from '@app/db/core/clientBoundary';

import { Route as RulebookEditorRoute } from './$rulesetSlug/rulebooks/$rulebookSlug/edit/route';
import { withUnpublishedRulebook } from './rulebooks-editor.stories.fixture';
import { rulebooksMeta } from './rulebooks.stories.fixture';

const meta = preview.meta({
  ...rulebooksMeta,
  title: 'Rulesets/Rulebooks/Editor',
});

export const MemberEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: {
    identity: { subjectKey: 'member', name: 'Member' },
    database: db(withUnpublishedRulebook),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Save' }, { timeout: 30_000 })).resolves.toBeDisabled();
    /* The next Edition's number is on the action that makes it; the toolbar states no Edition and no files. */
    await expect(page.getByRole('button', { name: 'Publish Edition 2' })).not.toHaveAttribute('aria-disabled');
    await expect(page.queryByRole('group', { name: 'Status' })).toBeNull();
    await expect(page.queryByRole('button', { name: 'Rename Rulebook' })).toBeNull();
  },
});

export const StaleEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  beforeEach: () => {
    const loader = RulebookEditorRoute.options.loader;
    RulebookEditorRoute.options.loader = async () => {
      parseClientBoundary(
        rulebookContentsV1Schema,
        { ...createRulebookStarterContents(), futureCatalogueOption: true },
        'Rulebook draft'
      );
      return null;
    };
    return () => {
      RulebookEditorRoute.options.loader = loader;
    };
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* A page story: the route is still loading when the play starts, as the sibling stories allow for. */
    await expect(await page.findByRole('heading', { name: 'This page changed' }, { timeout: 30_000 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
    await expect(page.queryByText(/unrecognized_keys/)).not.toBeInTheDocument();
  },
});
