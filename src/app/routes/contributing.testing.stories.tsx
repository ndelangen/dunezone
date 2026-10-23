import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { expectDiagramLabelsFit } from './contributing.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({ title: 'Contributing', ...pageStoryMeta });

/** Topic choices stay independent, and no panel introduces another navigation level. */
export const Navigation = meta.story({
  args: { path: '/contributing' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const code = within(await page.findByRole('region', { name: 'Codebase' }, { timeout: 30_000 }));
    const data = within(page.getByRole('region', { name: 'Data' }));
    const glossary = within(page.getByRole('region', { name: 'Technical glossary' }));
    const decisions = within(page.getByRole('region', { name: 'Design decisions' }));
    await userEvent.click(code.getByRole('tab', { name: 'Checks' }));
    await userEvent.click(data.getByRole('tab', { name: 'Reads and saves' }));
    await userEvent.click(glossary.getByRole('tab', { name: 'Image terms' }));
    await userEvent.click(decisions.getByRole('tab', { name: 'Layout and spacing' }));
    await Promise.all(
      (
        [
          [code, 'Checks'],
          [data, 'Reads and saves'],
          [glossary, 'Image terms'],
          [decisions, 'Layout and spacing'],
        ] as const
      ).map(async ([section, title]) => {
        await expect(section.getByRole('tab', { name: title })).toHaveAttribute('aria-selected', 'true');
      })
    );
    await Promise.all(
      page.getAllByRole('tabpanel').map(async (panel) => {
        await expect(within(panel).queryByRole('tablist')).toBeNull();
        await expect(within(panel).queryByRole('combobox')).toBeNull();
        await expect(within(panel).queryByRole('button', { name: 'Next step' })).toBeNull();
        await expect(within(panel).queryByRole('button', { name: 'Previous step' })).toBeNull();
      })
    );
  },
});
export const KeyboardNavigation = meta.story({
  args: { path: '/contributing' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const code = within(await page.findByRole('region', { name: 'Codebase' }, { timeout: 30_000 }));
    await userEvent.click(code.getByRole('tab', { name: 'Repository map' }));
    await userEvent.keyboard('{ArrowDown}');
    await expect(code.getByRole('tab', { name: 'Checks' })).toHaveFocus();
    await expect(code.getByRole('tabpanel', { name: 'Checks' })).toBeVisible();
    await userEvent.keyboard('{Home}');
    await expect(code.getByRole('tab', { name: 'Repository map' })).toHaveFocus();
    await expect(code.getByRole('tabpanel', { name: 'Repository map' })).toBeVisible();
  },
});
export const PhoneKitAndTests = meta.story({
  args: { path: '/contributing?code=testing&glossary=structure' },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const categories = await page.findByRole('region', { name: 'Six kit categories' }, { timeout: 30_000 });
    const name = within(categories).getByRole('textbox', { name: 'Example name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'WWWWWWWWWWWW');
    await expectDiagramLabelsFit(categories);
    await userEvent.clear(name);
    await userEvent.type(name, 'WWWWWWWWWWWWWWWW');
    const checks = page.getByRole('tabpanel', { name: 'Checks' });
    await Promise.all(
      [categories, checks].map(async (region) => {
        await expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth + 1);
        await expectDiagramLabelsFit(region);
      })
    );
  },
});
export const BoardsAndTints = meta.story({
  args: { path: '/contributing/glossary/board' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const glossary = within(await page.findByRole('region', { name: 'Dune Zone product terms' }, { timeout: 30_000 }));
    await userEvent.click(glossary.getByRole('switch', { name: 'Add stickers' }));
    await userEvent.click(glossary.getByRole('switch', { name: 'Outline only' }));
    await expect(glossary.getByRole('status')).toHaveTextContent(
      'Strongholds: 5 territories, outline only, with stickers.'
    );
    await userEvent.click(glossary.getByRole('radio', { name: 'Spice blow' }));
    await expect(glossary.getByRole('status')).toHaveTextContent(
      'Spice blow: 3 territories, outline only, with stickers.'
    );
    await userEvent.click(glossary.getByRole('tab', { name: 'Play' }));
    await expect(glossary.getByRole('figure', { name: 'Game stages and the phases inside play' })).toHaveTextContent(
      'Mentat Pause'
    );
    await userEvent.click(glossary.getByRole('tab', { name: 'Artwork' }));
    await expect(glossary.getByRole('heading', { name: 'Decal' })).toBeVisible();
    await expect(glossary.getByRole('heading', { name: 'Edition' })).toBeVisible();
  },
});
export const InteractionDecisions = meta.story({
  args: { path: '/contributing/design-decisions/look' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const toolbar = within(await page.findByRole('toolbar', { name: 'Example faction toolbar' }, { timeout: 30_000 }));
    await userEvent.click(toolbar.getByRole('button', { name: 'Save sample' }));
    await expect(page.getByText('Sample saved in this example.')).toBeVisible();
    await userEvent.click(toolbar.getByRole('button', { name: 'Reset sample' }));
    const deletion = within(page.getByRole('region', { name: 'Hold to delete' }));
    const trigger = deletion.getByRole('button', { name: 'Delete sample' });
    const pointer = userEvent.setup();
    await pointer.pointer([{ keys: '[MouseLeft>]', target: trigger }]);
    await expect(trigger).toHaveTextContent('deletion in 5..');
    await pointer.pointer([{ keys: '[/MouseLeft]', target: trigger }]);
    await expect(trigger).toHaveTextContent('Delete sample');
    await expect(deletion.queryByText('Sample deleted')).toBeNull();
    await pointer.pointer([{ keys: '[MouseLeft>]', target: trigger }]);
    await expect(deletion.findByText('Sample deleted', {}, { timeout: 8000 })).resolves.toBeVisible();
    await pointer.pointer([{ keys: '[/MouseLeft]' }]);
    await userEvent.click(deletion.getByRole('button', { name: 'Restore sample' }));
    await expect(deletion.getByRole('button', { name: 'Delete sample' })).toBeVisible();
  },
});

export const DataLifecycle = meta.story({
  args: { path: '/contributing?data=lifecycle#guide-data' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const example = within(
      await page.findByRole('figure', { name: 'A save updates both subscribed browsers' }, { timeout: 30_000 })
    );
    const name = example.getByRole('textbox', { name: 'Try a local name change' });
    const save = example.getByRole('button', { name: 'Save sample name' });
    await expect(save).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'Desert Alliance');
    await expect(example.getByRole('img', { name: 'Another reader shows House Atreides' })).toBeVisible();
    await userEvent.click(save);
    await expect(example.getByRole('img', { name: 'Your page shows Desert Alliance' })).toBeVisible();
    await expect(example.getByRole('img', { name: 'Another reader shows Desert Alliance' })).toBeVisible();
    await expect(save).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, '   ');
    await expect(save).toBeDisabled();
    await expect(example.getByRole('status')).toHaveTextContent('Both readers now show Desert Alliance.');
  },
});
export const PhoneSaveLoop = meta.story({
  args: { path: '/contributing?data=lifecycle#guide-data' },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const figure = await page.findByRole(
      'figure',
      { name: 'A save updates both subscribed browsers' },
      { timeout: 30_000 }
    );
    const example = within(figure);
    const name = example.getByRole('textbox', { name: 'Try a local name change' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Desert Alliance');
    await userEvent.click(example.getByRole('button', { name: 'Save sample name' }));
    await expect(
      example.getByRole('img', { name: /Your page and another reader both show Desert Alliance/ })
    ).toBeVisible();
    await expect(figure.scrollWidth).toBeLessThanOrEqual(figure.clientWidth);
  },
});
