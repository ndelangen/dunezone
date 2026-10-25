import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { expectDiagramLabelsFit } from './contributing.stories.fixture';
import { expectMissingLesson } from './contributing.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({ title: 'Contributing', ...pageStoryMeta });

export const Overview = meta.story({
  args: { path: '/contributing' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Contributing', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await Promise.all(
      ['Start here', 'Codebase', 'Data', 'Interface', 'How it ships', 'Technical glossary', 'Design decisions'].map(
        async (title) => {
          await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible();
          await expect(
            page.getByRole('region', { name: title }).querySelector('[data-connected-tabs-mobile-picker]')
          ).not.toBeNull();
        }
      )
    );
    const icons = page.getAllByRole('tab').map((tab) => tab.querySelector('svg')?.getAttribute('class'));
    await expect(icons.every(Boolean)).toBe(true);
    await expect(new Set(icons).size).toBe(icons.length);
  },
});
export const PhoneNavigation = meta.story({
  args: { path: '/contributing/glossary' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const picker = await page.findByRole('combobox', { name: 'Technical glossary topics' }, { timeout: 30_000 });
    await userEvent.click(picker);
    await userEvent.click(await page.findByRole('option', { name: 'Image terms' }));
    const glossary = within(page.getByRole('region', { name: 'Technical glossary' }));
    await expect(glossary.getByRole('tabpanel', { name: 'Image terms' })).toBeVisible();
    await expect(glossary.getByRole('combobox', { name: 'Technical glossary topics' })).toHaveTextContent(
      'Image terms'
    );
    await expect(page.getByRole('combobox', { name: 'Codebase topics' })).toHaveTextContent('Repository map');
  },
});
export const PhoneRolloutDiagrams = meta.story({
  args: { path: '/contributing/deployment' },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const shipping = await page.findByRole('region', { name: 'How it ships' }, { timeout: 30_000 });
    const diagramsFit = async () => {
      await expectDiagramLabelsFit(shipping);
      const tooWide = Array.from(shipping.querySelectorAll<HTMLElement>('figure, section, ol, pre, code'))
        .filter((element) => element.clientWidth > shipping.clientWidth)
        .map((element) => `${element.tagName}.${element.className}: ${element.clientWidth}`);
      await expect(shipping.scrollWidth, tooWide.join('\n')).toBeLessThanOrEqual(shipping.clientWidth + 1);
    };
    await expect(
      within(shipping).getByRole('figure', { name: 'Step 7: Deploy and check the site Worker' })
    ).toBeVisible();
    await diagramsFit();
    await userEvent.click(within(shipping).getByRole('combobox', { name: 'How it ships topics' }));
    await userEvent.click(await page.findByRole('option', { name: 'Schema changes' }));
    await expect(within(shipping).getByRole('region', { name: 'Verify' })).toBeVisible();
    await diagramsFit();
  },
});

export const UnknownCodeLesson = meta.story({
  args: { path: '/contributing/code/toString' },
  play: expectMissingLesson,
});
