import { testingPreview } from '@sb/preview';
import { completeHold } from '@ui/control/useHoldToConfirm.stories.fixture';
import { useEffect } from 'react';
import { expect, userEvent, waitFor, within, spyOn } from 'storybook/test';

import { db, useStorybookDatabaseClient } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { StorybookPage } from '../../storybook';
import { Route as RulebookEditorRoute } from './$rulesetSlug/rulebooks/$rulebookSlug/edit/route';
import {
  withUnpublishedRulebook,
  withThirtyPages,
  renderedPageCount,
  loadEditorArrival,
  renameRulebook,
  checkTitleMeasurements,
  renamedEditorPath,
} from './rulebooks-editor.stories.fixture';
import type { EditorArrival } from './rulebooks-editor.stories.fixture';
import { rulebooksMeta, withRulebooks } from './rulebooks.stories.fixture';

const meta = testingPreview.meta({
  ...rulebooksMeta,
  title: 'Rulesets/Rulebooks/Editor',
});

function withClippedRulebook(baseline: StorybookDatabase) {
  withUnpublishedRulebook(baseline);
  const draft = baseline.rulebook_drafts[0];
  const block = draft?.contents.pagesById.CHAP?.blocksById.HERA;
  if (!draft || block?.kind !== 'referenced-illustration') {
    throw new Error('Rulebook clipping Story needs its opening illustration');
  }
  /* A single-column region is the whole Page, so the caption has to outgrow a Page rather than a chapter band. */
  block.caption = 'The rule continues below the fixed Page. '.repeat(320).trim();
  return baseline;
}

function withRepeatedClippedRulebook(baseline: StorybookDatabase) {
  withClippedRulebook(baseline);
  const draft = baseline.rulebook_drafts[0];
  const page = draft?.contents.pagesById.CHAP;
  const block = page?.blocksById.HERA;
  if (!page || block?.kind !== 'referenced-illustration') {
    throw new Error('Repeated clipping Story needs its opening illustration');
  }
  page.blocksById.HERB = {
    ...structuredClone(block),
    id: 'HERB',
    caption: 'A second clipped illustration.',
  };
  page.blockOrderByRegion.content?.push('HERB');
  return baseline;
}

export const Rename = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  loaders: [loadEditorArrival],
  render: (args, { loaded }) => (
    <StorybookPage {...args} onResolved={(loaded.editorArrival as EditorArrival).observe} />
  ),
  play: ({ canvasElement, loaded }) => renameRulebook(canvasElement, loaded.editorArrival as EditorArrival),
});

export const RenameForm = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Rename Rulebook' }, { timeout: 30_000 }));
    await expect(page.getByRole('textbox', { name: 'Rulebook name' })).toBeVisible();
  },
});

/** A clipped Block reaches the header from another open Page, and its warning opens the Block. */
export const ClippedAuthorWarning = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#CHAP/details' },
  parameters: { database: db(withClippedRulebook) },
  globals: { viewport: { value: 'appAuthoringWide' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: 'Page 1 / Referenced illustration: is clipped' }, { timeout: 30_000 });
    await expect(page.getByText('Needs attention')).toBeVisible();
    await expect(page.queryByRole('alert', { name: 'Referenced illustration is clipped' })).toBeNull();
    await expect(page.getByRole('button', { name: 'Publish Edition 2' })).not.toHaveAttribute('aria-disabled');
    if (canvasElement.ownerDocument.defaultView) {
      canvasElement.ownerDocument.defaultView.location.hash = '#RULE/details';
    }
    await expect(page.findByRole('region', { name: 'Movement editor' })).resolves.toBeVisible();
    /* The header reads a report the hidden Pages publish a commit after they mount or unmount, so the warning is read under a retry rather than from the header the open Page arrived with.
     * The warning comes before the Page count inside the retry, so a measurement that stops covering every Page reports the warning it lost rather than the elements it stopped drawing. */
    await waitFor(
      async () => {
        await expect(page.getByRole('button', { name: 'Page 1 / Referenced illustration: is clipped' })).toBeVisible();
        await expect(renderedPageCount(canvasElement)).toBe(4);
      },
      { timeout: 30_000 }
    );
    await expect(canvasElement.ownerDocument.querySelectorAll('#movement')).toHaveLength(1);
    /* Changing the open Page replaces the header's measurement report, so use its current warning. */
    const warning = page.getByRole('button', { name: 'Page 1 / Referenced illustration: is clipped' });
    await expect(warning).toHaveAccessibleDescription(
      'Part of this Block will not be visible in the published Rulebook.'
    );
    await userEvent.click(warning);
    await waitFor(() => expect(canvasElement.ownerDocument.defaultView?.location.hash).toBe('#CHAP/HERA'));
    const editor = page.getByRole('region', { name: 'Saved movement revision editor' });
    await expect(
      within(editor).findByRole('alert', { name: 'Referenced illustration is clipped' })
    ).resolves.toHaveTextContent(
      'Part of this Block will not be visible in the published Rulebook. Shorten the Block to show all of it.'
    );
    await expect((within(editor).getByRole('textbox', { name: 'Caption' }) as HTMLTextAreaElement).value).toContain(
      'The rule continues below the fixed Page.'
    );
  },
});

/** Two clipped Blocks of one kind on the open Page each get their own warning, told apart by their ordinal. */
export const RepeatedClippedAuthorWarnings = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#CHAP/details' },
  parameters: { database: db(withRepeatedClippedRulebook) },
  globals: { viewport: { value: 'appAuthoringWide' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const first = await page.findByRole(
      'button',
      { name: 'Page 1 / Referenced illustration 1: is clipped' },
      { timeout: 30_000 }
    );
    await expect(first).toBeVisible();
    await expect(page.getByRole('button', { name: 'Page 1 / Referenced illustration 2: is clipped' })).toBeVisible();
    /* Both warnings name Page 1, so opening Page 2 is what proves they cover a Page the editor does not have open. */
    if (canvasElement.ownerDocument.defaultView) {
      canvasElement.ownerDocument.defaultView.location.hash = '#RULE/details';
    }
    await expect(page.findByRole('region', { name: 'Movement editor' })).resolves.toBeVisible();
    await waitFor(
      async () => {
        await expect(
          page.getByRole('button', { name: 'Page 1 / Referenced illustration 1: is clipped' })
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Page 1 / Referenced illustration 2: is clipped' })
        ).toBeVisible();
        await expect(renderedPageCount(canvasElement)).toBe(4);
      },
      { timeout: 30_000 }
    );
    await userEvent.click(page.getByRole('button', { name: 'Page 1 / Referenced illustration 2: is clipped' }));
    await waitFor(() => expect(canvasElement.ownerDocument.defaultView?.location.hash).toBe('#CHAP/HERB'));
    const editor = page.getByRole('region', { name: 'Saved movement revision editor' });
    await expect(within(editor).getByRole('alert', { name: 'Referenced illustration is clipped' })).toBeVisible();
    await expect((within(editor).getByRole('textbox', { name: 'Caption' }) as HTMLTextAreaElement).value).toBe(
      'A second clipped illustration.'
    );
  },
});

/** A completed hold on Publish publishes the next Edition, and the action then says there is nothing new to publish. */
export const PublishedEdition = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: { database: db(withUnpublishedRulebook) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByRole('button', { name: 'Publish Edition 2' }, { timeout: 30_000 });
    await completeHold(trigger);
    await waitFor(() =>
      expect(
        page.getByText('The new Edition is now current. HTML and PDF are being prepared independently.')
      ).toBeVisible()
    );
    await waitFor(() =>
      expect(page.getByRole('button', { name: /^Publish Edition/ })).toHaveAttribute('aria-disabled', 'true')
    );
  },
});

export const ThirtyPageReferencedDestination = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: {
    database: db((baseline) => {
      withThirtyPages(baseline);
      const text = baseline.rulebook_drafts[0]?.contents.pagesById.REFS?.blocksById.TEXT;
      if (text?.kind !== 'text') {
        throw new Error('Referenced destination story needs its reference text');
      }
      text.references = [{ pageId: 'CHAP' }];
      return baseline;
    }),
  },
  play: async ({ canvasElement }) => checkTitleMeasurements(canvasElement, ['CHAP', 'REFS']),
});

function ReferenceSubscriptionStory({ path }: { path: string }) {
  const client = useStorybookDatabaseClient();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          client.reset(
            db((baseline) => {
              withRulebooks(baseline);
              baseline.group_members = [];
              return baseline;
            }).create()
          )
        }
      >
        Revoke editing access
      </button>
      <StorybookPage path={path} />
    </>
  );
}

export const ReferenceEditsWithoutLoaderData = meta.story({
  render: (args) => <ReferenceSubscriptionStory {...args} />,
  parameters: { identity: { subjectKey: 'member', name: 'Member' } },
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/ASST' },
  beforeEach: () => {
    const loader = RulebookEditorRoute.options.loader;
    RulebookEditorRoute.options.loader = async () => null;
    return () => {
      RulebookEditorRoute.options.loader = loader;
    };
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const caption = await page.findByRole('textbox', { name: 'Caption' }, { timeout: 30_000 });
    await userEvent.clear(caption);
    await userEvent.type(caption, 'A local caption');
    await waitFor(() => expect(page.getByRole('textbox', { name: 'Caption' })).toHaveValue('A local caption'));
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Revoke editing access' }));
    await expect(
      page.findByRole('heading', { name: 'You cannot edit this Rulebook' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.queryByRole('textbox', { name: 'Caption' })).not.toBeInTheDocument();
  },
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
