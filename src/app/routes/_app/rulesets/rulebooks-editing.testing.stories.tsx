import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { RULEBOOK_BOARD_DEFINITIONS } from '@shared/rulebooks/boardDefinitions';
import { completeHold } from '@ui/control/useHoldToConfirm.stories.fixture';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { loadAssetPage } from '@db/assets';
import { loadFaction } from '@db/factions';
import { loadRulebookEditor } from '@db/rulebooks';
import { db } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { rulebooksMeta, withFinalRulebooks } from './rulebooks.stories.fixture';

const meta = testingPreview.meta({
  ...rulebooksMeta,
  title: 'Rulesets/Rulebooks/Editing',
});

export const FinalPageCatalogue = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Add Page' }, { timeout: 30_000 }));
    await expect(page.queryByRole('menuitem', { name: 'Chapter opener' })).not.toBeInTheDocument();
    await expect(
      waitForFrame(() => page.getByRole('menuitem', { name: 'Single column' }), { timeout: 30_000 })
    ).resolves.toBeInTheDocument();
    await expect(page.getByRole('menuitem', { name: 'Cover' })).toBeInTheDocument();
    await userEvent.click(page.getByRole('menuitem', { name: 'Narrow left / wide right' }));
    const preview = page.getByRole('article', { name: 'Rulebook page: New page' });
    await expect(preview).toHaveAttribute('data-rulebook-layout', 'wide-narrow');
    await expect(page.queryByRole('combobox', { name: /Wide position|Arrangement/i })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('switch', { name: 'Show page heading' }));
    await expect(within(preview).queryByText('New page')).not.toBeInTheDocument();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('New page');
    await userEvent.click(page.getByRole('button', { name: 'Add Block' }));
    await expect(
      waitForFrame(() => page.getByRole('menuitem', { name: 'Question and answer' }))
    ).resolves.toBeInTheDocument();
    await expect(page.queryByRole('menuitem', { name: 'Repeated text' })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('menuitem', { name: 'Question and answer' }));
    await expect(page.getByRole('textbox', { name: 'Question' })).toBeVisible();
  },
});

export const TallPageCatalogue = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: {
    database: db((baseline) => {
      withFinalRulebooks(baseline);
      baseline.rulebooks[0]!.settings = { size: 'tall', design: 'illustrated' };
      return baseline;
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Add Page' }, { timeout: 30_000 }));
    await waitForFrame(() => page.getByRole('menuitem', { name: 'Single column' }), { timeout: 30_000 });
    await expect(page.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Single column',
      'Content with bottom strip',
      'Cover',
    ]);
  },
});

export const UnsavedFactionReference = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/HEAD' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.queryByRole('textbox', { name: 'Search factions' })).not.toBeInTheDocument();
    await userEvent.click(await page.findByRole('button', { name: 'Choose faction' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('option', { name: /House Atreides/ }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Use faction' }));
    await expect(page.findByRole('button', { name: 'House Atreides' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('textbox', { name: 'Search factions' })).not.toBeInTheDocument();
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    const preview = page.getByRole('article', { name: 'Rulebook page: Introduction' });
    const heading = preview.querySelector('[data-rulebook-block-id="HEAD"]');
    await waitFor(() => expect(heading).toHaveAttribute('data-faction-name', 'House Atreides'));
    await expect(heading).toHaveAccessibleName(/House Atreides/);
    await expect(heading).not.toHaveAttribute('title');
  },
});

export const NewCoverNaming = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Add Page' }, { timeout: 30_000 }));
    await userEvent.click(await waitForFrame(() => page.getByRole('menuitem', { name: 'Cover' })));
    const title = await page.findByRole('textbox', { name: 'Title' });
    await expect(title).toHaveValue('New cover');
    await userEvent.clear(title);
    await userEvent.type(title, 'Kiss Rules');
    const cover = page.getByRole('article', { name: 'Rulebook page: Kiss Rules' });
    await expect(within(cover).getByRole('heading', { name: 'Kiss Rules' })).toBeVisible();
    await userEvent.click(page.getByRole('radio', { name: 'Preset' }));
    await userEvent.click(page.getByRole('combobox', { name: 'Cover preset' }));
    await userEvent.click(await page.findByRole('option', { name: 'KISS planet' }));
    await expect(cover.querySelector('.rulebookCoverBackground')).toHaveAttribute(
      'src',
      '/image/rulebook-cover/kiss-planet-print.jpg'
    );
    await userEvent.click(page.getByRole('switch', { name: 'Show page heading' }));
    await expect(within(cover).queryByRole('heading', { name: 'Kiss Rules' })).not.toBeInTheDocument();
    await expect(title).toHaveValue('Kiss Rules');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Saved' })).toBeDisabled());
    await userEvent.click(page.getByRole('link', { name: 'Cover footer' }));
    await userEvent.click(page.getByRole('link', { name: 'Page details' }));
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Kiss Rules');
    await expect(page.getByRole('switch', { name: 'Show page heading' })).not.toBeChecked();
  },
});

export const UnsavedCoverControls = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#CVER/cover' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const input = await page.findByRole('textbox', { name: 'Background image URL' }, { timeout: 30_000 });
    await expect(page.getByRole('textbox', { name: 'Anchor' })).toHaveValue('cover');
    await expect(page.getByRole('link', { name: 'Page details' })).toHaveAttribute('aria-current', 'page');
    await expect(page.queryByRole('link', { name: 'Cover details' })).not.toBeInTheDocument();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Dreamrules');
    await expect(page.getByRole('switch', { name: 'Show page heading' })).toBeChecked();
    await userEvent.type(input, '/page/cover-a.svg');
    await expect(page.getByText('Cover image must be a full https:// URL')).toBeVisible();
    const cover = page.getByRole('article', { name: 'Rulebook page: Dreamrules' });
    await expect(cover.querySelector('.rulebookCoverBackground')).toBeNull();
    await userEvent.clear(input);
    await expect(input).toHaveValue('');
    await expect(page.queryByText('Cover image must be a full https:// URL')).not.toBeInTheDocument();
    await expect(within(cover).getByRole('img', { name: 'Dune' })).toBeVisible();
    await userEvent.click(page.getByRole('switch', { name: 'Show Dune logo' }));
    await expect(within(cover).queryByRole('img', { name: 'Dune' })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('switch', { name: 'Show Dune logo' }));
    await userEvent.click(page.getByRole('switch', { name: 'Show subtitle' }));
    await expect(page.queryByRole('textbox', { name: 'Subtitle' })).not.toBeInTheDocument();
    await expect(within(cover).queryByText('Rules for Arrakis')).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('switch', { name: 'Show subtitle' }));
    await expect(page.getByRole('textbox', { name: 'Subtitle' })).toHaveValue('Rules for Arrakis');
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await expect(cover).toHaveAttribute('data-rulebook-page-number', '2');
  },
});

export const CoverPresetsAndFooter = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#CVER/details' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('radio', { name: 'Preset' }, { timeout: 30_000 }));
    await expect(page.queryByRole('switch', { name: 'Show cover footer' })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('combobox', { name: 'Cover preset' }));
    await userEvent.click(await page.findByRole('option', { name: 'Shai-Hulud cavern' }));
    await expect(page.queryByRole('textbox', { name: 'Background image URL' })).not.toBeInTheDocument();
    const cover = page.getByRole('article', { name: 'Rulebook page: Dreamrules' });
    await expect(cover.querySelector('.rulebookCoverBackground')).toHaveAttribute(
      'src',
      '/image/rulebook-cover/worm-cavern-print.jpg'
    );
    await userEvent.click(page.getByRole('link', { name: 'Cover footer' }));
    await waitFor(() =>
      expect(page.getByRole('link', { name: 'Cover footer' })).toHaveAttribute('aria-current', 'page')
    );
    await expect(page.queryByRole('combobox', { name: 'Cover preset' })).not.toBeInTheDocument();
    await expect(page.queryByRole('textbox', { name: 'Subtitle' })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('switch', { name: 'Show cover footer' }));
    await userEvent.type(page.getByRole('textbox', { name: 'Footer title' }), 'House Atreides');
    await userEvent.type(page.getByRole('textbox', { name: 'Footer label' }), 'House expansion');
    await waitFor(() => expect(cover.querySelector('.rulebookCoverFooter')).toHaveTextContent('House Atreides'));
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await userEvent.click(page.getByRole('switch', { name: 'Show cover footer' }));
    await expect(cover.querySelector('.rulebookCoverFooter')).toBeNull();
    await userEvent.click(page.getByRole('switch', { name: 'Show cover footer' }));
    await expect(page.getByRole('textbox', { name: 'Footer title' })).toHaveValue('House Atreides');
    await userEvent.click(page.getByRole('link', { name: 'Page details' }));
    await expect(page.findByRole('combobox', { name: 'Cover preset' })).resolves.toHaveValue('Shai-Hulud cavern');
    await expect(page.queryByRole('switch', { name: 'Show cover footer' })).not.toBeInTheDocument();
    await expect(cover.querySelector('.rulebookCoverFooter')).toHaveTextContent('House Atreides');
    await userEvent.click(page.getByRole('link', { name: 'Cover footer' }));
    await expect(page.findByRole('switch', { name: 'Show cover footer' })).resolves.toBeChecked();
    await expect(page.getByRole('textbox', { name: 'Footer title' })).toHaveValue('House Atreides');
    await expect(page.getByRole('textbox', { name: 'Footer label' })).toHaveValue('House expansion');
    await userEvent.click(page.getByRole('button', { name: 'Choose left faction' }));
    await userEvent.click(await page.findByRole('option', { name: /House Atreides/ }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Use faction' }));
    await expect(page.findByRole('button', { name: 'Choose left faction: House Atreides' })).resolves.toHaveTextContent(
      'House Atreides'
    );
  },
});

function withLiveReferenceRulebook(baseline: StorybookDatabase) {
  withFinalRulebooks(baseline);
  const faction = baseline.factions.find((row) => row.$key === 'faction:house-atreides')!;
  const data = faction.data as { factionLeader: { memberId?: string }; leaders: Array<{ memberId?: string }> };
  data.factionLeader.memberId = '10000000-0000-4000-8000-000000000001';
  data.leaders.forEach((member, index) => {
    member.memberId = `10000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`;
  });
  const page = baseline.rulebook_drafts[0]!.contents.pagesById.RULE!;
  page.title = 'Game components';
  page.blocksById = {
    ARTW: { id: 'ARTW', kind: 'referenced-illustration', caption: 'Choose a Leader for your battle plan.' },
    NVNT: {
      id: 'NVNT',
      kind: 'illustrated-inventory',
      title: 'Game components',
      introduction: '',
      itemOrder: ['MAPA'],
      itemsById: {
        MAPA: {
          id: 'MAPA',
          source: { kind: 'board', boardId: 'arrakis' },
          text: 'Place troops on the territories.',
          quantity: 1,
        },
      },
    },
    FACT: { id: 'FACT', kind: 'faction-introduction', text: 'A faction introduction belongs to the author.' },
  };
  page.blockOrderByRegion = { content: ['ARTW', 'NVNT', 'FACT'] };
  return baseline;
}

export const LiveReferenceEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/ARTW' },
  parameters: { database: db(withLiveReferenceRulebook) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.queryByRole('textbox', { name: 'Search factions' })).not.toBeInTheDocument();
    await userEvent.click(await page.findByRole('button', { name: 'Choose source' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('combobox', { name: 'Source type' }));
    await userEvent.click(await page.findByRole('option', { name: 'Leader' }));
    await userEvent.click(await page.findByRole('option', { name: /House Atreides/ }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Choose Leader' }));
    await userEvent.click(await page.findByRole('button', { name: 'Gurney Halleck · Leader' }, { timeout: 30_000 }));
    await expect(page.queryByRole('textbox', { name: 'Search factions' })).not.toBeInTheDocument();
    await expect(page.getByRole('textbox', { name: 'Caption' })).toHaveValue('Choose a Leader for your battle plan.');
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
    /* The saved draft holds the chosen Leader as the illustration's live source. */
    const saved = await loadRulebookEditor({ rulesetSlug: 'classicrules', rulebookSlug: 'book-0' });
    const illustration = saved?.kind === 'editable' ? saved.draft.contents.pagesById.RULE?.blocksById.ARTW : undefined;
    await expect(illustration).toMatchObject({
      source: { kind: 'faction-member', memberId: expect.stringMatching(/^10000000-0000-4000-8000-/) },
    });
  },
});

export const FactionIntroductionEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/FACT' },
  parameters: { database: db(withLiveReferenceRulebook) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Choose faction' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('option', { name: /House Atreides/ }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Use faction' }));
    await expect(page.findByRole('button', { name: 'House Atreides' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Introduction' })).toHaveValue(
      'A faction introduction belongs to the author.'
    );
    const preview = page.getByRole('article', { name: 'Rulebook page: Game components' });
    await expect(within(preview).findByRole('heading', { name: 'House Atreides' })).resolves.toBeVisible();
  },
});

export const DeletePagesAndBlocks = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/HEAD' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const removeBlock = await page.findByRole('button', { name: 'Delete Block' }, { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Delete Page' }).closest('nav')).not.toBeNull();
    await expect(removeBlock.closest('nav')).toBeNull();
    await expect(removeBlock.closest('[aria-label="Introduction editor"]')).not.toBeNull();
    await completeHold(removeBlock);
    await waitFor(() => expect(page.queryByRole('button', { name: 'Delete Block' })).not.toBeInTheDocument());
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Introduction');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
    for (let count = 2; count > 0; count -= 1) {
      const removePage = page.getByRole('button', { name: 'Delete Page' });
      const addBlock = page.getByRole('button', { name: 'Add Block' });
      await expect(removePage.closest('nav')).toBe(addBlock.closest('nav'));
      await expect(removePage.getBoundingClientRect().bottom).toBeLessThanOrEqual(addBlock.getBoundingClientRect().top);
      await completeHold(removePage);
      await waitFor(async () => {
        if (count === 1) {
          await expect(page.getByText('This Rulebook has no Pages.')).toBeVisible();
        } else {
          await expect(within(page.getByRole('navigation', { name: 'Pages' })).getAllByRole('link')).toHaveLength(
            count - 1
          );
        }
      });
    }
    await userEvent.click(page.getByRole('button', { name: 'Add Page' }));
    await userEvent.click(await waitForFrame(() => page.getByRole('menuitem', { name: 'Cover' })));
    await expect(page.findByRole('switch', { name: 'Show Dune logo' })).resolves.toBeChecked();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('New cover');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
  },
});

export const RemoveLastRegionBlock = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const region = await page.findByRole('region', { name: 'Content' }, { timeout: 30_000 });
    for (let count = 3; count > 0; count -= 1) {
      const remove = page.getByRole('button', { name: 'Remove last Block from Content' });
      await completeHold(remove);
      await waitFor(() => expect(within(region).queryAllByRole('button', { name: /^Edit / })).toHaveLength(count - 1));
      await expect(
        page.queryByRole('button', { name: 'Edit Pay spice to bring reserves onto Dune.' })
      ).not.toBeInTheDocument();
    }
    await expect(page.getByRole('button', { name: 'Remove last Block from Content' })).toBeDisabled();
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
  },
});

export const FormatBlockText = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/TEXT' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const field = (await page.findByRole('textbox', { name: 'Content' }, { timeout: 30_000 })) as HTMLTextAreaElement;
    field.focus();
    field.setSelectionRange(8, 16);
    await userEvent.click(page.getByRole('button', { name: 'Bold' }));
    await expect(field.value).toContain('*Arrakeen*');
    const preview = page.getByRole('article', { name: 'Rulebook page: Introduction' });
    await expect(preview.querySelector('strong')).toHaveTextContent('Arrakeen');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
  },
});

export const AuthoredBookSettings = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const size = await page.findByRole('combobox', { name: 'Book size' }, { timeout: 30_000 });
    await userEvent.click(size);
    await userEvent.click(page.getByRole('option', { name: 'GF9 core (254 × 254 mm)' }));
    const preview = page.getByRole('article', { name: 'Rulebook page: Introduction' });
    await expect(preview).toHaveAttribute('data-rulebook-size', 'gf9-core');
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
    const saved = await loadRulebookEditor({ rulesetSlug: 'classicrules', rulebookSlug: 'book-0' });
    if (saved?.kind !== 'editable') {
      throw new Error('Expected editable saved book');
    }
    await expect(saved.draft.settings).toEqual({ size: 'gf9-core', design: 'illustrated' });
    await expect(saved.draft.revision).toBe(2);
    await expect(saved.rulebook.settings.size).toBe('gf9-core');
  },
});

export const RawJsonSettingsAndContents = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Account changes discard pending Load sessions; settle the signed-in identity before pasting. */
    await page.findByRole('button', { name: 'Central' });
    await page.findByRole('button', { name: 'Load existing Rulebook' });
    const before = await loadRulebookEditor({ rulesetSlug: 'classicrules', rulebookSlug: 'book-0' });
    if (before?.kind !== 'editable') {
      throw new Error('Expected an editable Rulebook.');
    }
    const value = { settings: { size: 'gf9-core', design: 'illustrated' }, contents: before.draft.contents };
    const open = async () => {
      await userEvent.click(await page.findByRole('button', { name: 'Load existing Rulebook' }));
      await userEvent.click(page.getByRole('textbox', { name: 'Writable JSON' }));
      await userEvent.paste(JSON.stringify(value));
      await expect(page.getByRole('textbox', { name: 'Writable JSON' })).toHaveValue(JSON.stringify(value));
      const load = page.getByRole('button', { name: 'Load Rulebook' });
      await waitFor(() => expect(load).toBeEnabled());
      await userEvent.click(load);
    };
    await open();
    const untouched = await loadRulebookEditor({ rulesetSlug: 'classicrules', rulebookSlug: 'book-0' });
    await expect(untouched?.kind === 'editable' && untouched.draft.revision).toBe(before.draft.revision);
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await open();
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' })).resolves.toBeDisabled();
    const saved = await loadRulebookEditor({ rulesetSlug: 'classicrules', rulebookSlug: 'book-0' });
    if (saved?.kind !== 'editable') {
      throw new Error('Expected a saved Rulebook.');
    }
    await expect(saved.draft.settings).toEqual(value.settings);
    await expect(saved.draft.contents).toEqual(before.draft.contents);
    await expect(saved.rulebook._id).toBe(before.rulebook._id);
    await expect(saved.currentEdition.edition_number).toBe(before.currentEdition.edition_number);
  },
});

export const RawJsonReferencePreflight = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: 'Central' });
    await page.findByRole('button', { name: 'Load existing Rulebook' });
    const before = await loadRulebookEditor({ rulesetSlug: 'classicrules', rulebookSlug: 'book-0' });
    if (before?.kind !== 'editable') {
      throw new Error('Expected an editable Rulebook.');
    }
    const deck = (await loadAssetPage('deck', 'house-treachery'))!;
    const faction = (await loadFaction('house-atreides')).faction;
    const value = { settings: before.draft.settings, contents: structuredClone(before.draft.contents) };
    value.contents.pagesById.RULE.blocksById = {
      TEST: {
        id: 'TEST',
        kind: 'board-scene',
        boardId: RULEBOOK_BOARD_DEFINITIONS[0].id,
        caption: 'Validated scene',
        players: [],
        troops: [],
        highlights: [],
        annotations: [],
        tokens: [{ layerId: 'one', asset_id: deck.asset.id, x: 10, y: 10, size: 20, rotation: 0 }],
      },
    };
    value.contents.pagesById.RULE.blockOrderByRegion = { content: ['TEST'] };
    await userEvent.click(page.getByRole('button', { name: 'Load existing Rulebook' }));
    const validate = async () => {
      const input = page.getByRole('textbox', { name: 'Writable JSON' });
      await userEvent.clear(input);
      await userEvent.click(input);
      await userEvent.paste(JSON.stringify(value));
    };
    await validate();
    await expect(page.findByText(/TEST.tokens.0.asset_id: Choose an available token-disc/)).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Load Rulebook' })).toBeDisabled();
    value.contents.pagesById.RULE.blocksById = {
      TEST: {
        id: 'TEST',
        kind: 'referenced-illustration',
        caption: 'Validated troop',
        source: {
          kind: 'faction-troop',
          factionId: faction._id,
          troopId: faction.data.troops[0].troopId!,
          face: 'back',
        },
      },
    };
    await validate();
    await expect(page.findByText(/TEST.source.face: This troop has no back face/)).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Load Rulebook' })).toBeDisabled();
    const block = value.contents.pagesById.RULE.blocksById.TEST;
    if (block.kind !== 'referenced-illustration' || block.source?.kind !== 'faction-troop') {
      throw new Error('Expected selected troop.');
    }
    block.source.face = 'front';
    await validate();
    await waitFor(() => expect(page.getByRole('button', { name: 'Load Rulebook' })).toBeEnabled());
    await userEvent.click(page.getByRole('button', { name: 'Load Rulebook' }));
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    const unchanged = await loadRulebookEditor({ rulesetSlug: 'classicrules', rulebookSlug: 'book-0' });
    await expect(unchanged?.kind === 'editable' && unchanged.draft).toEqual(before.draft);
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  },
});

export const BookSizeRespectsPageLayouts = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: {
    database: db((baseline) => {
      withFinalRulebooks(baseline);
      const page = baseline.rulebook_drafts[0]!.contents.pagesById.RULE!;
      page.layoutId = 'two-columns';
      page.blockOrderByRegion = { column1: page.blockOrderByRegion.content ?? [], column2: [] };
      return baseline;
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const size = await page.findByRole('combobox', { name: 'Book size' }, { timeout: 30_000 });
    await userEvent.click(size);
    const tall = page.getByRole('option', { name: /Tall .*Page layouts do not fit/ });
    const expansion = page.getByRole('option', { name: /GF9 expansion .*Page layouts do not fit/ });
    await expect(tall).toHaveAttribute('aria-disabled', 'true');
    await expect(expansion).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(expansion);
    await expect(size).toHaveValue('A4 (210 × 297 mm)');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.click(page.getByRole('option', { name: 'GF9 core (254 × 254 mm)' }));
    await expect(size).toHaveValue('GF9 core (254 × 254 mm)');
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  },
});

export const TraitorSourceEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/ARTW' },
  parameters: { database: db(withLiveReferenceRulebook) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Choose source' }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('combobox', { name: 'Source type' }));
    await userEvent.click(page.getByRole('option', { name: 'Leader' }));
    await userEvent.click(page.getByRole('combobox', { name: 'Presentation' }));
    await userEvent.click(page.getByRole('option', { name: 'Traitor card' }));
    await userEvent.click(await page.findByRole('option', { name: /House Atreides/ }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Choose Leader' }));
    await userEvent.click(await page.findByRole('button', { name: 'Gurney Halleck · Leader' }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
    const saved = await loadRulebookEditor({ rulesetSlug: 'classicrules', rulebookSlug: 'book-0' });
    await expect(saved?.kind === 'editable' && saved.draft.contents.pagesById.RULE?.blocksById.ARTW).toMatchObject({
      source: { kind: 'faction-member', presentation: 'traitor' },
    });
  },
});

export const FactionTokenSourceEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/ARTW' },
  parameters: { database: db(withLiveReferenceRulebook) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Choose source' }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('combobox', { name: 'Source type' }));
    await userEvent.click(page.getByRole('option', { name: 'Faction emblem' }));
    await userEvent.click(page.getByRole('combobox', { name: 'Presentation' }));
    await userEvent.click(page.getByRole('option', { name: 'Faction token' }));
    await userEvent.click(await page.findByRole('option', { name: /House Atreides/ }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Use faction' }));
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
    const saved = await loadRulebookEditor({ rulesetSlug: 'classicrules', rulebookSlug: 'book-0' });
    await expect(saved?.kind === 'editable' && saved.draft.contents.pagesById.RULE?.blocksById.ARTW).toMatchObject({
      source: { kind: 'faction', presentation: 'token' },
    });
  },
});
