import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters } from './chapterStory';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Create your own game',
  args: { path: '/tutorial/create-a-game' },
  globals: chapterGlobals,
  parameters: chapterParameters,
});

export const CreateAndOpen = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const current = () => canvasElement.ownerDocument.querySelector('[data-state="current"]')?.textContent ?? '';
    await page.findByRole('banner', { name: 'Chapter 2: Create your own game' }, { timeout: 60_000 });
    await waitForFrame(() => expect(current()).toContain('Choose a ruleset'));
    const form = within(page.getByRole('form', { name: 'New game' }));
    await userEvent.click(form.getByRole('combobox', { name: /^Ruleset$/ }));
    await userEvent.click(page.getByRole('option', { name: 'Dreamrules' }));
    await waitForFrame(() => expect(current()).toContain('Make room for friends'), { timeout: 20_000 });
    form.getByRole('slider', { name: 'Minimum players' }).focus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    await waitForFrame(() => expect(current()).toContain('Choose the last turn'), { timeout: 20_000 });
    form.getByRole('slider', { name: 'Last turn' }).focus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    await waitForFrame(() => expect(current()).toContain('Give your game a name'), { timeout: 20_000 });
    await userEvent.click(form.getByRole('switch', { name: 'Set a custom name' }));
    await userEvent.type(form.getByPlaceholderText('Name your game'), 'Caladan with friends');
    await userEvent.keyboard('{Enter}');
    await waitForFrame(() => expect(current()).toContain('Open your table'), { timeout: 20_000 });
    await waitForFrame(() => expect(form.getByRole('button', { name: 'Create game' })).toBeEnabled());
    await userEvent.click(form.getByRole('button', { name: 'Create game' }));
    await page.findByRole('heading', { name: 'Caladan with friends' }, { timeout: 60_000 });
    await page.findByRole('region', { name: 'Players' }, { timeout: 60_000 });
    await page.findByRole('heading', { name: /Chapter complete/ }, { timeout: 60_000 });
  },
});

export const OpenAtCreate = meta.story({
  args: { path: '/tutorial/create-a-game?step=5' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('banner', { name: 'Chapter 2: Create your own game' }, { timeout: 60_000 });
    await expect(page.getByPlaceholderText('Name your game')).toHaveValue('Arrakis with friends');
    await expect(page.getByRole('slider', { name: 'Minimum players' })).toHaveAttribute('aria-valuenow', '4');
    await expect(page.getByRole('slider', { name: 'Last turn' })).toHaveAttribute('aria-valuenow', '8');
    await userEvent.click(page.getByRole('button', { name: /^Reset$/ }));
    await expect(page.getByRole('switch', { name: 'Set a custom name' })).not.toBeChecked();
    await expect(page.getByRole('slider', { name: 'Minimum players' })).toHaveAttribute('aria-valuenow', '6');
  },
});

export const RulesetArrowLeavesLabelClear = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const form = await page.findByRole('form', { name: 'New game' }, { timeout: 60_000 });
    /* The arrow lands beside the ruleset field and leaves its label clear, however high the pass's name sets the form. */
    const label = form.querySelector('.mantine-Select-root label')!;
    const arrow = () =>
      canvasElement.ownerDocument.querySelector<SVGPathElement>('path[data-target]:not([data-target=""])');
    await waitFor(() => expect(arrow()).not.toBeNull(), { timeout: 20_000 });
    /* It aims at the whole field, label and all, so the gap its tip keeps holds from the label as well as the input. */
    const aimsAtField = () => {
      const field = label.closest('.mantine-Select-root')!.getBoundingClientRect();
      const [x, y] = arrow()!.getAttribute('data-target')!.split(' ').map(Number);
      return Math.abs(x! - (field.left + field.width / 2)) <= 1 && Math.abs(y! - (field.top + field.height / 2)) <= 1;
    };
    const covers = () => {
      const path = arrow()!;
      const origin = path.ownerSVGElement!.getBoundingClientRect();
      const box = label.getBoundingClientRect();
      for (let x = box.left; x <= box.right; x += 2) {
        for (let y = box.top; y <= box.bottom; y += 2) {
          if (path.isPointInFill(new DOMPoint(x - origin.left, y - origin.top))) {
            return true;
          }
        }
      }
      return false;
    };
    /* A name on one line sets the form higher; the barbs as well as the tip still leave the label clear (guideArrow.test.ts covers the slanted approach). */
    const custom = within(form).getByRole('switch', { name: 'Set a custom name' });
    if (!(custom as HTMLInputElement).checked) {
      await userEvent.click(custom);
    }
    const name = within(form).getByPlaceholderText('Name your game');
    await userEvent.clear(name);
    await userEvent.type(name, 'Caladan wedding traitor');
    await waitFor(() => expect(aimsAtField()).toBe(true), { timeout: 5000 });
    await expect(covers()).toBe(false);
  },
});
