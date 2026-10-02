/* Editing a Rulebook's Pages, Blocks and cover, and saving the result (#1590). */
import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { install } from '@sinonjs/fake-timers';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { rulebooksMeta, withFinalRulebooks } from './rulebooks.stories.fixture';

const meta = preview.meta({
  ...rulebooksMeta,
  title: 'Rulesets/Rulebooks/Editing',
});

export const FinalPageCatalogue = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Add Page' }, { timeout: 30_000 }));
    expect(page.queryByRole('menuitem', { name: 'Chapter opener' })).not.toBeInTheDocument();
    await expect(
      waitForFrame(() => page.getByRole('menuitem', { name: 'Single column' }), { timeout: 30_000 })
    ).resolves.toBeInTheDocument();
    expect(page.getByRole('menuitem', { name: 'Cover' })).toBeInTheDocument();
    await userEvent.click(page.getByRole('menuitem', { name: 'Narrow left / wide right' }));
    const preview = page.getByRole('article', { name: 'Rulebook page: New page' });
    expect(preview).toHaveAttribute('data-rulebook-layout', 'wide-narrow');
    expect(page.queryByRole('combobox', { name: /Wide position|Arrangement/i })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('switch', { name: 'Show page heading' }));
    expect(within(preview).queryByText('New page')).not.toBeInTheDocument();
    expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('New page');
    await userEvent.click(page.getByRole('button', { name: 'Add Block' }));
    await expect(
      waitForFrame(() => page.getByRole('menuitem', { name: 'Question and answer' }))
    ).resolves.toBeInTheDocument();
    expect(page.queryByRole('menuitem', { name: 'Repeated text' })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('menuitem', { name: 'Question and answer' }));
    expect(page.getByRole('textbox', { name: 'Question' })).toBeVisible();
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
    expect(page.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Single column', 'Cover']);
  },
});

export const UnsavedFactionReference = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/HEAD' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    expect(page.queryByRole('textbox', { name: 'Search factions' })).not.toBeInTheDocument();
    await userEvent.click(await page.findByRole('button', { name: 'Choose faction' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('option', { name: /House Atreides/ }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Use faction' }));
    await expect(page.findByRole('button', { name: 'House Atreides' }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('textbox', { name: 'Search factions' })).not.toBeInTheDocument();
    expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    const preview = page.getByRole('article', { name: 'Rulebook page: Introduction' });
    const heading = preview.querySelector('[data-rulebook-block-id="HEAD"]');
    await waitFor(() => expect(heading).toHaveAttribute('title', 'House Atreides'));
  },
});

export const CoverPageDetails = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#CVER/details' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('textbox', { name: 'Anchor' }, { timeout: 30_000 })).resolves.toHaveValue('cover');
    expect(page.getByRole('switch', { name: 'Show Dune logo' })).toBeInTheDocument();
    expect(page.getByRole('textbox', { name: 'Subtitle' })).toHaveValue('Rules for Arrakis');
    expect(page.getByRole('textbox', { name: 'Supporting text' })).toBeVisible();
    expect(page.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    expect(page.queryByRole('switch', { name: 'Show page heading' })).not.toBeInTheDocument();
    expect(page.queryByRole('link', { name: 'Cover details' })).not.toBeInTheDocument();
    expect(page.getByRole('link', { name: 'Cover footer' })).toBeVisible();
  },
});

export const UnsavedCoverControls = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#CVER/cover' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const input = await page.findByRole('textbox', { name: 'Background image URL' }, { timeout: 30_000 });
    expect(page.getByRole('textbox', { name: 'Anchor' })).toHaveValue('cover');
    expect(page.getByRole('link', { name: 'Page details' })).toHaveAttribute('aria-current', 'page');
    expect(page.queryByRole('link', { name: 'Cover details' })).not.toBeInTheDocument();
    expect(page.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    expect(page.queryByRole('switch', { name: 'Show page heading' })).not.toBeInTheDocument();
    await userEvent.type(input, '/page/cover-a.svg');
    expect(page.getByText('Cover image must be a full https:// URL')).toBeVisible();
    const cover = page.getByRole('article', { name: 'Rulebook page: Dreamrules' });
    expect(cover.querySelector('.rulebookCoverBackground')).toBeNull();
    await userEvent.clear(input);
    expect(input).toHaveValue('');
    expect(page.queryByText('Cover image must be a full https:// URL')).not.toBeInTheDocument();
    expect(within(cover).getByRole('img', { name: 'Dune' })).toBeVisible();
    await userEvent.click(page.getByRole('switch', { name: 'Show Dune logo' }));
    expect(within(cover).queryByRole('img', { name: 'Dune' })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('switch', { name: 'Show Dune logo' }));
    await userEvent.click(page.getByRole('switch', { name: 'Show subtitle' }));
    expect(page.queryByRole('textbox', { name: 'Subtitle' })).not.toBeInTheDocument();
    expect(within(cover).queryByText('Rules for Arrakis')).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('switch', { name: 'Show subtitle' }));
    expect(page.getByRole('textbox', { name: 'Subtitle' })).toHaveValue('Rules for Arrakis');
    expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(cover).toHaveAttribute('data-rulebook-page-number', '2');
  },
});

export const CoverPresetsAndFooter = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#CVER/details' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('radio', { name: 'Preset' }, { timeout: 30_000 }));
    expect(page.queryByRole('switch', { name: 'Show cover footer' })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('combobox', { name: 'Cover preset' }));
    await userEvent.click(await page.findByRole('option', { name: 'Worm cavern' }));
    expect(page.queryByRole('textbox', { name: 'Background image URL' })).not.toBeInTheDocument();
    const cover = page.getByRole('article', { name: 'Rulebook page: Dreamrules' });
    expect(cover.querySelector('.rulebookCoverBackground')).toHaveAttribute(
      'src',
      '/image/rulebook-cover/worm-cavern-print.jpg'
    );
    await userEvent.click(page.getByRole('link', { name: 'Cover footer' }));
    await waitFor(() =>
      expect(page.getByRole('link', { name: 'Cover footer' })).toHaveAttribute('aria-current', 'page')
    );
    expect(page.queryByRole('combobox', { name: 'Cover preset' })).not.toBeInTheDocument();
    expect(page.queryByRole('textbox', { name: 'Subtitle' })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('switch', { name: 'Show cover footer' }));
    await userEvent.type(page.getByRole('textbox', { name: 'Footer title' }), 'House Atreides');
    await userEvent.type(page.getByRole('textbox', { name: 'Footer label' }), 'House expansion');
    await waitFor(() => expect(cover.querySelector('.rulebookCoverFooter')).toHaveTextContent('House Atreides'));
    expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await userEvent.click(page.getByRole('switch', { name: 'Show cover footer' }));
    expect(cover.querySelector('.rulebookCoverFooter')).toBeNull();
    await userEvent.click(page.getByRole('switch', { name: 'Show cover footer' }));
    expect(page.getByRole('textbox', { name: 'Footer title' })).toHaveValue('House Atreides');
    await userEvent.click(page.getByRole('link', { name: 'Page details' }));
    await expect(page.findByRole('combobox', { name: 'Cover preset' })).resolves.toHaveValue('Worm cavern');
    expect(page.queryByRole('switch', { name: 'Show cover footer' })).not.toBeInTheDocument();
    expect(cover.querySelector('.rulebookCoverFooter')).toHaveTextContent('House Atreides');
    await userEvent.click(page.getByRole('link', { name: 'Cover footer' }));
    await expect(page.findByRole('switch', { name: 'Show cover footer' })).resolves.toBeChecked();
    expect(page.getByRole('textbox', { name: 'Footer title' })).toHaveValue('House Atreides');
    expect(page.getByRole('textbox', { name: 'Footer label' })).toHaveValue('House expansion');
    await userEvent.click(page.getByRole('button', { name: 'Choose left faction' }));
    await userEvent.click(await page.findByRole('option', { name: /House Atreides/ }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Use faction' }));
    await expect(page.findByRole('button', { name: 'Choose left faction: House Atreides' })).resolves.toHaveTextContent(
      'House Atreides'
    );
  },
});

export const WrittenRuleEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: { database: db(withFinalRulebooks) },
});

export const WrittenRuleEditorDark = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: { database: db(withFinalRulebooks) },
  globals: { colorScheme: 'dark' },
});

function withLiveReferenceRulebook(baseline: StorybookDatabase) {
  withFinalRulebooks(baseline);
  const faction = baseline.factions.find((row) => row.$key === 'faction:house-atreides')!;
  const data = faction.data as { leader: { memberId?: string }; leaders: Array<{ memberId?: string }> };
  data.leader.memberId = '10000000-0000-4000-8000-000000000001';
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
          text: 'Place forces on the territories.',
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
  globals: { colorScheme: 'dark' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    expect(page.queryByRole('textbox', { name: 'Search factions' })).not.toBeInTheDocument();
    await userEvent.click(await page.findByRole('button', { name: 'Choose source' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('combobox', { name: 'Source type' }));
    await userEvent.click(await page.findByRole('option', { name: 'Leader' }));
    await userEvent.click(await page.findByRole('option', { name: /House Atreides/ }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Choose Leader' }));
    await userEvent.click(await page.findByRole('button', { name: 'Gurney Halleck · Leader' }, { timeout: 30_000 }));
    expect(page.queryByRole('textbox', { name: 'Search factions' })).not.toBeInTheDocument();
    await expect(page.getByRole('textbox', { name: 'Caption' })).toHaveValue('Choose a Leader for your battle plan.');
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
  },
});

export const InventoryEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/NVNT' },
  parameters: { database: db(withLiveReferenceRulebook) },
  globals: { colorScheme: 'dark' },
});

export const FactionIntroductionEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/FACT' },
  parameters: { database: db(withLiveReferenceRulebook) },
  globals: { colorScheme: 'dark' },
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

/** Advance the hold's intervals while pointer events, rendering, and database waits keep their real clocks. */
async function holdToDelete(trigger: HTMLElement) {
  const clock = install({
    toFake: ['setInterval', 'clearInterval'],
    shouldClearNativeTimers: true,
  });
  try {
    await userEvent.pointer({ target: trigger, keys: '[MouseLeft>]' });
    await clock.tickAsync(5000);
  } finally {
    try {
      await userEvent.pointer({ target: trigger, keys: '[/MouseLeft]' });
    } finally {
      clock.uninstall();
    }
  }
}

export const DeletePagesAndBlocks = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/HEAD' },
  parameters: { database: db(withFinalRulebooks) },
  globals: { colorScheme: 'dark' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const removeBlock = await page.findByRole('button', { name: 'Delete Block' }, { timeout: 30_000 });
    expect(page.getByRole('button', { name: 'Delete Page' }).closest('nav')).not.toBeNull();
    expect(removeBlock.closest('nav')).toBeNull();
    expect(removeBlock.closest('[aria-label="Introduction editor"]')).not.toBeNull();
    await holdToDelete(removeBlock);
    await waitFor(() => expect(page.queryByRole('button', { name: 'Delete Block' })).not.toBeInTheDocument());
    expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Introduction');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
    for (let count = 2; count > 0; count -= 1) {
      const removePage = page.getByRole('button', { name: 'Delete Page' });
      const addBlock = page.getByRole('button', { name: 'Add Block' });
      expect(removePage.closest('nav')).toBe(addBlock.closest('nav'));
      expect(removePage.getBoundingClientRect().bottom).toBeLessThanOrEqual(addBlock.getBoundingClientRect().top);
      await holdToDelete(removePage);
      await waitFor(() => {
        if (count === 1) {
          expect(page.getByText('This Rulebook has no Pages.')).toBeVisible();
        } else {
          expect(within(page.getByRole('navigation', { name: 'Pages' })).getAllByRole('link')).toHaveLength(count - 1);
        }
      });
    }
    await userEvent.click(page.getByRole('button', { name: 'Add Page' }));
    await userEvent.click(await waitForFrame(() => page.getByRole('menuitem', { name: 'Cover' })));
    await expect(page.findByRole('switch', { name: 'Show Dune logo' })).resolves.toBeChecked();
    expect(page.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
  },
});

export const RemoveLastRegionBlock = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: { database: db(withFinalRulebooks) },
  globals: { colorScheme: 'dark' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const region = await page.findByRole('region', { name: 'Content' }, { timeout: 30_000 });
    for (let count = 3; count > 0; count -= 1) {
      const remove = page.getByRole('button', { name: 'Remove last Block from Content' });
      await holdToDelete(remove);
      await waitFor(() => expect(within(region).queryAllByRole('button', { name: /^Edit / })).toHaveLength(count - 1));
      expect(
        page.queryByRole('button', { name: 'Edit Pay spice to bring reserves onto Dune.' })
      ).not.toBeInTheDocument();
    }
    expect(page.getByRole('button', { name: 'Remove last Block from Content' })).toBeDisabled();
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
  },
});

export const FormatBlockText = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/TEXT' },
  parameters: { database: db(withFinalRulebooks) },
  globals: { colorScheme: 'dark' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const field = (await page.findByRole('textbox', { name: 'Content' }, { timeout: 30_000 })) as HTMLTextAreaElement;
    field.focus();
    field.setSelectionRange(8, 16);
    await userEvent.click(page.getByRole('button', { name: 'Bold' }));
    expect(field.value).toContain('*Arrakeen*');
    const preview = page.getByRole('article', { name: 'Rulebook page: Introduction' });
    expect(preview.querySelector('strong')).toHaveTextContent('Arrakeen');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
  },
});

export const FlipFactionIntroduction = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/FACT' },
  parameters: {
    database: db((baseline) => {
      withFinalRulebooks(baseline);
      const page = baseline.rulebook_drafts[0]!.contents.pagesById.RULE!;
      page.blocksById = {
        FACT: {
          id: 'FACT',
          kind: 'faction-introduction',
          factionId: ref('faction:house-atreides') as unknown as string,
          text: 'The Atreides use knowledge to choose their battles.',
        },
      };
      page.blockOrderByRegion = { content: ['FACT'] };
    }),
  },
  globals: { colorScheme: 'dark' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const toggle = await page.findByRole('switch', { name: 'Flip layout' }, { timeout: 30_000 });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    const block = canvasElement.querySelector('.rulebookFactionIntroduction');
    await waitFor(() => expect(block).toHaveAttribute('data-flipped', 'true'));
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
    expect(toggle).toBeChecked();
    expect(block).toHaveAttribute('data-flipped', 'true');
  },
});
