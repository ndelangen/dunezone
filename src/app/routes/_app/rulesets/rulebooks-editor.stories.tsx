/* The Rulebook editor around its Pages: deep links, renaming, the clipping warnings, publishing, a stale draft and lost access (#1590). */
import preview from '@sb/preview';
import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import { createRulebookStarterContents } from '@shared/rulebooks/fixtures';
import { useEffect } from 'react';
import { expect, spyOn, waitFor, within } from 'storybook/test';

import { db, useStorybookDatabaseClient } from '@db/storybook';
import { parseClientBoundary } from '@app/db/core/clientBoundary';

import { StorybookPage } from '../../storybook';
import { Route as RulebookEditorRoute } from './$rulesetSlug/rulebooks/$rulebookSlug/edit/route';
import {
  withUnpublishedRulebook,
  withThirtyPages,
  renamedEditorPath,
  loadEditorArrival,
  renameRulebook,
  checkTitleMeasurements,
} from './rulebooks-editor.stories.fixture';
import type { EditorArrival } from './rulebooks-editor.stories.fixture';
import { rulebooksMeta } from './rulebooks.stories.fixture';

const meta = preview.meta({
  ...rulebooksMeta,
  title: 'Rulesets/Rulebooks/Editor',
});

/* Deliver the real old-address refusal after the caller reaches its next action, before the new editor can arrive. */
function holdOldAddressQuery(client: ReturnType<typeof useStorybookDatabaseClient>, arrival: EditorArrival) {
  const query = client.query;
  const delivery = new Promise<void>((resolve) => {
    arrival.releaseOldQuery = resolve;
  });
  let retirement: Promise<void> | undefined;
  const retireOldWorkspace = async () => {
    await waitFor(() => expect(arrival.oldQueryHeld).toBe(true));
    await waitFor(() => expect(arrival.waitingFor === renamedEditorPath || arrival.earlyRename).toBe(true));
    arrival.releaseOldQuery();
    await waitFor(() =>
      expect(arrival.canvasElement.querySelector('[aria-label="Rulebook editing workspace"]')).toBeNull()
    );
    arrival.oldWorkspaceRetired = true;
  };
  const heldQuery = spyOn(client, 'query').mockImplementation(async (fn, args, identity) => {
    if (args.rulebook_slug === 'battle-reference') {
      retirement ??= retireOldWorkspace();
      await retirement;
    }
    const result = await query(fn, args, identity);
    if (args.rulebook_slug === 'book-0' && result === null) {
      arrival.oldQueryHeld = true;
      await delivery;
    }
    return result;
  });
  const capture = (event: MouseEvent) => {
    if (
      arrival.oldQueryHeld &&
      arrival.pathname !== renamedEditorPath &&
      event.target instanceof Element &&
      event.target.closest('button[aria-label="Rename Rulebook"]')
    ) {
      arrival.earlyRename = true;
    }
  };
  arrival.canvasElement.addEventListener('click', capture, true);
  return () => {
    heldQuery.mockRestore();
    arrival.releaseOldQuery();
    arrival.canvasElement.removeEventListener('click', capture, true);
  };
}

function LateOldAddressRenameStory({ path, arrival }: { path: string; arrival: EditorArrival }) {
  const client = useStorybookDatabaseClient();
  useEffect(() => holdOldAddressQuery(client, arrival), [client, arrival]);
  return <StorybookPage path={path} onResolved={arrival.observe} />;
}

export const RenameAfterOldAddressExpires = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  loaders: [loadEditorArrival],
  render: (args, { loaded }) => <LateOldAddressRenameStory {...args} arrival={loaded.editorArrival as EditorArrival} />,
  play: async ({ canvasElement, loaded }) => {
    const arrival = loaded.editorArrival as EditorArrival;
    await renameRulebook(canvasElement, arrival);
    await expect(arrival.oldQueryHeld).toBe(true);
    await expect(arrival.oldWorkspaceRetired).toBe(true);
    await expect(arrival.earlyRename).toBe(false);
  },
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

export const DeepLinkedEditorBlock = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#REFS/TEXT' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const editor = await page.findByRole('region', { name: 'Markers and tokens editor' }, { timeout: 30_000 });
    await expect(within(editor).getByRole('textbox', { name: 'Anchor' })).toHaveValue('marker-note');
    await expect(page.getByRole('article', { name: 'Rulebook page: Markers and tokens' })).toBeVisible();
  },
});

export const InvalidEditorDeepLink = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#MISSING/UNKNOWN' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const editor = await page.findByRole('region', { name: 'Welcome to Arrakis editor' }, { timeout: 30_000 });
    await expect(within(editor).getByRole('textbox', { name: 'Title' })).toHaveValue('Welcome to Arrakis');
    await expect(page.getByRole('article', { name: 'Rulebook page: Welcome to Arrakis' })).toBeVisible();
  },
});

/**
 * Thirty Pages, and the guard for the one behaviour that size is about.
 * Without a play the Story ended while the database worker was still starting, so it reported a pass for an editor that never mounted.
 */
export const ThirtyPageEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: { database: db(withThirtyPages) },
  play: async ({ canvasElement }) => checkTitleMeasurements(canvasElement, ['CHAP']),
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
