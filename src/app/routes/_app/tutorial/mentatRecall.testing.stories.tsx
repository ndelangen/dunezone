import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter, waitForRail } from './chapterStory';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Mentat recall',
  args: { path: '/tutorial/mentat-recall' },
  globals: chapterGlobals,
  parameters: chapterParameters,
});

export const Chapter = meta.story({
  play: playChapter('Chapter 20: Mentat recall', 'Look back together'),
});

function chapterDriver(canvasElement: HTMLElement) {
  const document = canvasElement.ownerDocument;
  const page = within(document.body);
  const current = () => document.querySelector('[data-state="current"]')?.textContent ?? '';
  const step = (title: string) => waitForRail(() => expect(current()).toContain(title));
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
  const firstCheckpoint = async () => {
    (await page.findByRole('slider', { name: 'Checkpoint' })).focus();
    await userEvent.keyboard('{Home}');
  };
  const pinHistory = async () => {
    await waitForFrame(() => expect(document.querySelector('[data-recall-controls="true"]')).not.toBeNull());
    if (!recall().queryByRole('group', { name: 'Shared history' })) {
      await userEvent.click(recall().getByRole('button', { name: 'Controls Space' }));
      (await page.findByRole('textbox', { name: 'Search controls' })).focus();
      await userEvent.keyboard('{ArrowUp}');
      await userEvent.keyboard(' ');
    }
    const history = await recall().findByRole('group', { name: 'Shared history' });
    if (history.getAttribute('data-side') !== 'right') {
      await userEvent.click(within(history).getByRole('button', { name: 'Pin to the bottom right' }));
    }
  };
  const askToRecallStorm = async () => {
    await open('Mentat recall');
    await firstCheckpoint();
    await userEvent.click(page.getByRole('button', { name: 'Ask the table to recall' }));
  };
  const sideTable = async () => {
    await userEvent.keyboard('j');
    return recall().findByRole('group', { name: 'Your recalled private side table' });
  };
  const counterPosition = (side: HTMLElement) =>
    within(side)
      .getByRole('img', { name: /^Atreides Battle Loss Counter/ })
      .closest('figure')!
      .getAttribute('style');
  return {
    document,
    page,
    step,
    enterAt,
    open,
    recall,
    firstCheckpoint,
    pinHistory,
    askToRecallStorm,
    sideTable,
    counterPosition,
  };
}

type ChapterDriver = ReturnType<typeof chapterDriver>;

/* The live hand pinned bottom left is what the return at the end of the chapter restores. */
async function pinLiveHand({ page }: ChapterDriver) {
  await userEvent.keyboard('h');
  await userEvent.click(await page.findByRole('button', { name: 'Pin to the bottom left' }));
}

async function enterRecall(driver: ChapterDriver) {
  const { enterAt, step, firstCheckpoint, page, askToRecallStorm } = driver;
  await enterAt('Look back together');
  await step('Keep your live hand open');
  await pinLiveHand(driver);
  await step('Ask to recall Storm');
  await askToRecallStorm();
  await step('Agree to recall');
  /* The header links Mentat recall to its window, where the proposer withdraws. */
  await userEvent.click(
    within(page.getByRole('group', { name: 'Mentat recall vote' })).getByRole('button', { name: 'Mentat recall' })
  );
  await userEvent.click(await page.findByRole('button', { name: 'Withdraw' }));
  await page.findByRole('button', { name: 'Ask the table to recall' });
  await userEvent.keyboard('{Enter}');
  await step('Agree to recall');
  await firstCheckpoint();
  await userEvent.click(page.getByRole('button', { name: 'Ask the table to recall' }));
  await enterAt('Agree to recall');
  await step('Look around the frozen table');
  await userEvent.click(page.getByRole('button', { name: /^Focus on right/ }));
}

async function inspectFirstInventory({ step, recall, sideTable, counterPosition }: ChapterDriver) {
  await step('Inspect your recalled hand');
  await userEvent.click(recall().getByRole('button', { name: /^Your recalled hand, you are playing as/ }));
  const hand = recall().getByRole('group', { name: 'Your recalled hand' });
  await waitForFrame(async () => {
    await expect(within(hand).getByLabelText('Spice reserve balance')).toBeVisible();
    await expect(within(hand).queryByRole('button', { name: /^(?:Drag|Withdraw)/ })).toBeNull();
  });
  await step('Inspect your private side table');
  const side = await sideTable();
  await waitForFrame(async () => {
    await expect(within(side).getByRole('img', { name: /^Kwisatz Haderach/ })).toBeVisible();
    await expect(within(side).queryByRole('button', { name: /^Move / })).toBeNull();
  });
  return counterPosition(side);
}

/* Returning before the chapter is done resumes play with the normal panels, and the rail waits at the same task. */
async function returnEarly({ step, page, document }: ChapterDriver) {
  await step('Inspect your recalled hand');
  await userEvent.click(page.getByRole('button', { name: 'Return to the game' }));
  await waitForFrame(() => expect(document.querySelector('[data-recall-controls="true"]')).toBeNull());
  await expect(document.querySelector('[data-side="left"][data-window="hand"]')).toBeVisible();
  await expect(document.querySelector('[data-state="current"]')).toHaveTextContent('Inspect your recalled hand');
}

/* A recall asked for mid-chapter, which the task's practice players agree to. */
async function recallStormAgain({ step, page, askToRecallStorm }: ChapterDriver) {
  await step('Inspect your recalled hand');
  await askToRecallStorm();
  await page.findByRole('group', { name: 'Mentat recall in progress' }, { timeout: 30_000 });
}

async function compareInventory(
  { step, pinHistory, recall, sideTable, counterPosition }: ChapterDriver,
  firstCounter: string | null
) {
  await step('Slide through time');
  await pinHistory();
  const slider = await recall().findByRole('slider', { name: 'Checkpoint' });
  slider.focus();
  await userEvent.keyboard('{End}');
  await step('Compare your later hand');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Turn 3, Spice Blow');
  await userEvent.click(recall().getByRole('button', { name: /^Your recalled hand, you are playing as/ }));
  await waitForFrame(() => expect(recall().getByLabelText('Spice reserve balance')).toHaveTextContent('6'));
  await step('Compare the private tracker');
  const laterSide = await sideTable();
  await waitForFrame(() => expect(counterPosition(laterSide)).not.toBe(firstCounter));
  await step('Step back one checkpoint');
  await userEvent.click(recall().getByRole('button', { name: 'Earlier checkpoint' }));
  await step('Send a recall message');
  await expect(recall().getByRole('slider', { name: 'Checkpoint' })).toHaveAttribute('aria-valuetext', 'Turn 3, Storm');
}

async function chatAndReturn({ step, recall, page, document }: ChapterDriver) {
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
}

/*
 * Every exercise uses the practice table's real controls, including its historical inventories and temporary conversation.
 * The chapter is played in two stories of about 35 s each, so a runner 1.7x slower than usual still finishes either inside the
 * suite's 120 s kill: one story through all fourteen tasks took 76 to 95 s on CI and timed out on such a runner (#1045).
 * Each story also leaves recall once, early or at the end; that a replacement recall continues the chapter's tasks is the
 * chapter script's own test (chapterScripts/mentatRecall.test.tsx).
 */

/** Tasks 1 to 6: asking for the Storm checkpoint, the vote and the frozen table; returning early leaves the rail waiting at task 7. */
export const RecallStorm = meta.story({
  play: async ({ canvasElement }) => {
    const driver = chapterDriver(canvasElement);
    await driver.page.findByRole('banner', { name: 'Chapter 20: Mentat recall' }, { timeout: 60_000 });
    await expect(driver.document.querySelector('[data-recall-controls="true"]')).toBeNull();
    await enterRecall(driver);
    await returnEarly(driver);
  },
});

/** The chapter opened at its seventh task with `?step=7`: a new recall, the inventories at two checkpoints, the chat and the return. */
export const FromTheRecalledHand = meta.story({
  args: { path: '/tutorial/mentat-recall?step=7' },
  play: async ({ canvasElement }) => {
    const driver = chapterDriver(canvasElement);
    await driver.page.findByRole('banner', { name: 'Chapter 20: Mentat recall' }, { timeout: 60_000 });
    await pinLiveHand(driver);
    await recallStormAgain(driver);
    const firstCounter = await inspectFirstInventory(driver);
    await compareInventory(driver, firstCounter);
    await chatAndReturn(driver);
  },
});
