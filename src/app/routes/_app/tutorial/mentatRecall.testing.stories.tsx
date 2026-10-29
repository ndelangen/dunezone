import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters } from './chapterStory';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Mentat recall',
  args: { path: '/tutorial/mentat-recall' },
  globals: chapterGlobals,
  parameters: chapterParameters,
});

/* Every exercise uses the practice table's real controls, including its historical inventories and temporary conversation. */
export const PlayedThrough = meta.story({
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    await page.findByRole('banner', { name: 'Chapter 20: Mentat recall' }, { timeout: 60_000 });
    await expect(document.querySelector('[data-recall-controls="true"]')).toBeNull();
    const current = () => document.querySelector('[data-state="current"]')?.textContent ?? '';
    const step = (title: string) => waitForFrame(() => expect(current()).toContain(title), { timeout: 60_000 });
    const enterAt = async (title: string) => {
      await step(title);
      await waitForFrame(
        async () => {
          if (current().includes(title)) {
            await userEvent.keyboard('{Enter}');
          }
          await expect(current()).not.toContain(title);
        },
        { timeout: 20_000, interval: 1000 }
      );
    };
    const open = async (name: string) => {
      await userEvent.keyboard(' ');
      await userEvent.type(await page.findByRole('textbox', { name: 'Search controls' }), name);
      await userEvent.keyboard('{Enter}');
    };
    const recall = () => within(document.querySelector<HTMLElement>('[data-recall-controls="true"]')!);

    await enterAt('Look back together');
    await step('Keep your live hand open');
    await userEvent.keyboard('h');
    await userEvent.click(await page.findByRole('button', { name: 'Pin to the bottom left' }));
    await step('Ask to recall Storm');
    await open('Mentat recall');
    await userEvent.click(await page.findByRole('button', { name: 'Earlier checkpoint' }));
    await userEvent.click(page.getByRole('button', { name: 'Ask the table to recall' }));
    await step('Agree to recall');
    await userEvent.click(
      within(page.getByRole('group', { name: 'Mentat recall vote' })).getByRole('button', { name: 'Withdraw' })
    );
    await page.findByRole('button', { name: 'Ask the table to recall' });
    await userEvent.keyboard('{Enter}');
    await step('Agree to recall');
    await userEvent.click(page.getByRole('button', { name: 'Earlier checkpoint' }));
    await userEvent.click(page.getByRole('button', { name: 'Ask the table to recall' }));
    await enterAt('Agree to recall');
    await step('Look around the frozen table');
    await userEvent.click(page.getByRole('button', { name: /^Focus on right/ }));

    await step('Inspect your recalled hand');
    await userEvent.click(recall().getByRole('button', { name: /^Your recalled hand, you are playing as/ }));
    const hand = recall().getByRole('group', { name: 'Your recalled hand' });
    await waitForFrame(async () => {
      await expect(within(hand).getByLabelText('Spice reserve balance')).toBeVisible();
      await expect(within(hand).queryByRole('button', { name: /^(?:Drag|Withdraw)/ })).toBeNull();
    });
    await step('Inspect your private side table');
    await userEvent.click(page.getByRole('button', { name: 'Return to the game' }));
    await waitForFrame(() =>
      expect(
        within(document.querySelector<HTMLElement>('[data-state="current"]')!).getByText(/If recall closes early/)
      ).toBeVisible()
    );
    if (!page.queryByRole('button', { name: 'Ask the table to recall' })) {
      await open('Mentat recall');
    }
    await userEvent.click(await page.findByRole('button', { name: 'Earlier checkpoint' }));
    await userEvent.click(page.getByRole('button', { name: 'Ask the table to recall' }));
    await page.findByRole('group', { name: 'Mentat recall in progress' }, { timeout: 30_000 });
    await userEvent.keyboard('j');
    const side = await recall().findByRole('group', { name: 'Your recalled private side table' });
    await waitForFrame(async () => {
      await expect(within(side).getByRole('img', { name: /^Kwisatz Haderach/ })).toBeVisible();
      await expect(within(side).queryByRole('button', { name: /^Move / })).toBeNull();
    });

    await step('Slide through time');
    await userEvent.keyboard(' {ArrowUp} ');
    const slider = await recall().findByRole('slider', { name: 'Checkpoint' });
    slider.focus();
    await userEvent.keyboard('{End}');
    await step('Step back one checkpoint');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Turn 1, Spice Blow');
    await userEvent.click(recall().getByRole('button', { name: 'Earlier checkpoint' }));
    await step('Send a recall message');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Turn 1, Storm');
    await userEvent.click(recall().getByRole('button', { name: /^Recall chat/ }));
    const field = await recall().findByRole('textbox', { name: 'Message' });
    await userEvent.type(field, 'The Storm checkpoint');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await userEvent.type(field, 'is frozen.');
    await expect(field).toHaveValue('The Storm checkpoint\nis frozen.');
    await userEvent.keyboard('{Enter}');
    await step('Return to the game');
    await expect(recall().getByRole('region', { name: 'Conversation history' })).toHaveTextContent(
      'The Storm checkpoint'
    );
    await userEvent.click(page.getByRole('button', { name: 'Return to the game' }));
    await page.findByRole('dialog', {}, { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Next phase', hidden: true })).toBeVisible();
    await expect(page.getByText('Spice Blow', { exact: true })).toBeVisible();
    await expect(document.querySelector('[data-side="left"][data-window="hand"]')).toBeVisible();
    await expect(document.querySelector('[data-recall-controls="true"]')).toBeNull();
  },
});
