import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

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
    await userEvent.hover(warning);
    await waitForFrame(() =>
      expect(page.getByRole('tooltip')).toHaveTextContent(
        'Part of this Block will not be visible in the published Rulebook.'
      )
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

/** Publishing is held, not clicked: a press short of five seconds publishes nothing, and the hover text says to hold (Norbert, 2026-09-29). */
export const PublishIsHeld = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: { database: db(withUnpublishedRulebook) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByRole('button', { name: 'Publish Edition 2' }, { timeout: 30_000 });
    await userEvent.hover(trigger);
    await waitForFrame(() => expect(page.getByRole('tooltip')).toHaveTextContent('hold to publish'));
    await userEvent.click(trigger);
    await expect(
      page.queryByText('The new Edition is now current. HTML and PDF are being prepared independently.')
    ).toBeNull();
    await expect(trigger).not.toHaveAttribute('aria-disabled');
  },
});

/** Holding Publish for five seconds publishes the next Edition, and the action then says there is nothing new to publish. */
export const PublishedEdition = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: { database: db(withUnpublishedRulebook) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByRole('button', { name: 'Publish Edition 2' }, { timeout: 30_000 });
    /* The keyboard holds too: Space held down runs the countdown, which is the one real five seconds this suite waits. */
    trigger.focus();
    await userEvent.keyboard('[Space>]');
    await waitFor(
      () =>
        expect(
          page.getByText('The new Edition is now current. HTML and PDF are being prepared independently.')
        ).toBeVisible(),
      { timeout: 15_000 }
    );
    await userEvent.keyboard('[/Space]');
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
