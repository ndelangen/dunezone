import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, fn, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterParameters } from './chapterStory';

const spoken = fn<(utterance: SpeechSynthesisUtterance) => void>();
const preference = 'dunezone-tutorial:speaking-mode';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Welcome',
  args: { path: '/tutorial/welcome' },
  globals: { motion: 'off' },
  beforeEach: () => {
    const saved = localStorage.getItem(preference);
    const synthesis = Object.getOwnPropertyDescriptor(window, 'speechSynthesis');
    localStorage.removeItem(preference);
    spoken.mockClear();
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak: spoken, cancel: fn(), getVoices: () => [] },
    });
    return () => {
      if (saved === null) {
        localStorage.removeItem(preference);
      } else {
        localStorage.setItem(preference, saved);
      }
      if (synthesis) {
        Object.defineProperty(window, 'speechSynthesis', synthesis);
      } else {
        Reflect.deleteProperty(window, 'speechSynthesis');
      }
    };
  },
});

/** Welcome can be passed silently; enabling speech then follows the active description. */
export const SpeakingMode = meta.story({
  parameters: chapterParameters,
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const banner = await page.findByRole('banner', { name: 'Chapter 1: Welcome' }, { timeout: 60_000 });
    const rail = within(banner);
    await waitForFrame(() => expect(spoken).toHaveBeenCalledTimes(1), { timeout: 60_000 });
    const toggle = rail.getByRole('button', { name: 'Turn speaking mode on' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    /* This invitation intentionally pulses even with motion off. */
    await expect(getComputedStyle(toggle).animationName).not.toBe('none');
    await userEvent.keyboard('{Enter}');
    await waitForFrame(() =>
      expect(rail.getByText('This is the table').closest('li')).toHaveAttribute('data-state', 'current')
    );
    await waitForFrame(() =>
      expect(document.querySelector('[data-tutorial-pointer]')?.getAttribute('d') ?? '').toContain('Q')
    );
    await expect(spoken).toHaveBeenCalledTimes(1);
    await expect(getComputedStyle(toggle).animationName).toBe('none');
    await userEvent.keyboard('z');
    await waitForFrame(() => expect(spoken).toHaveBeenCalledTimes(2));
    await expect(spoken.mock.calls.at(-1)![0].text).toMatch(/^This is your shared table/);
    await expect(spoken.mock.calls.at(-1)![0].text).not.toMatch(/^This is the table\./);
    await expect(rail.getByRole('button', { name: 'Turn speaking mode off' })).toHaveAttribute('aria-pressed', 'true');
    const title = rail.getByText('This is the table');
    const row = title.closest('li')!;
    const description = within(row).getByText(/This is your shared table/);
    const badge = row.querySelector('span')!;
    await expect(description.getBoundingClientRect().left).toBeCloseTo(row.getBoundingClientRect().left, 0);
    await expect(description.getBoundingClientRect().width).toBeCloseTo(row.getBoundingClientRect().width, 0);
    await expect(getComputedStyle(badge).fontFamily).toContain('C_Advokat_Modern');
    await expect(badge.getBoundingClientRect().width).toBeLessThan(30);
    await userEvent.keyboard('{Enter}');
    await waitForFrame(() => expect(spoken).toHaveBeenCalledTimes(3));
    await expect(spoken.mock.calls.at(-1)![0].text).toMatch(/^Each player has a faction token/);
    await userEvent.click(rail.getByRole('button', { name: 'Turn speaking mode off' }));
    await userEvent.click(rail.getByRole('button', { name: 'Reset' }));
    await waitForFrame(() =>
      expect(rail.getByText('Hear the steps aloud').closest('li')).toHaveAttribute('data-state', 'current')
    );
    await expect(rail.getByRole('button', { name: 'Turn speaking mode on' })).toHaveAttribute('aria-pressed', 'false');
    await expect(spoken).toHaveBeenCalledTimes(3);
  },
});
