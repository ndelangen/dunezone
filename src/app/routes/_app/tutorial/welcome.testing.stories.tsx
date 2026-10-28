import { _roots } from '@react-three/fiber/webgpu';
import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { isFactionToken } from '@shared/play/factionToken';
import { stackTopHeight, TABLE_SURFACE_Y } from '@shared/play/tableGeometry';
import { expect, fn, spyOn, userEvent, within } from 'storybook/test';
import { Vector3 } from 'three';

import { pageStoryMeta } from '../../storybookConfig';
import { waitForPlayCamera } from '../play/mapView.stories.fixture';
import { chapterParameters } from './chapterStory';
import setup from './setup/setup.json';
import { startAt } from './setup/tutorialSetup';
import type { TutorialSetup } from './setup/tutorialSetup';

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
    const introduction = rail.getByText('Welcome to the first tutorial.');
    const shortcut = rail.getByText(/on your keyboard to toggle speaking mode/);
    const start = rail.getByText(/to start\./);
    await expect(introduction.tagName).toBe('P');
    await expect(shortcut.tagName).toBe('P');
    await expect(start.tagName).toBe('P');
    await expect(shortcut.getBoundingClientRect().top).toBeGreaterThan(introduction.getBoundingClientRect().bottom);
    await expect(start.getBoundingClientRect().top).toBeGreaterThan(shortcut.getBoundingClientRect().bottom);
    await expect(spoken.mock.calls[0]![0].text.split('\n\n')).toHaveLength(3);
    const toggle = rail.getByRole('button', { name: 'Turn speaking mode on' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    /* This invitation intentionally pulses even with motion off. */
    await expect(getComputedStyle(toggle).animationName).not.toBe('none');
    await userEvent.keyboard('{Enter}');
    await waitForFrame(() =>
      expect(rail.getByText('The board').closest('li')).toHaveAttribute('data-state', 'current')
    );
    await waitForFrame(() =>
      expect(document.querySelector('[data-tutorial-pointer]')?.getAttribute('d') ?? '').toContain('Q')
    );
    await expect(spoken).toHaveBeenCalledTimes(1);
    await expect(getComputedStyle(toggle).animationName).toBe('none');
    await userEvent.keyboard('z');
    await waitForFrame(() => expect(spoken).toHaveBeenCalledTimes(2));
    await expect(spoken.mock.calls.at(-1)![0].text).toMatch(/^The board shows the planet Arrakis/);
    await expect(spoken.mock.calls.at(-1)![0].text).not.toMatch(/^The board\./);
    await expect(rail.getByRole('button', { name: 'Turn speaking mode off' })).toHaveAttribute('aria-pressed', 'true');
    const title = rail.getByText('The board');
    const row = title.closest('li')!;
    const description = within(row).getByText(/The board shows the planet Arrakis/);
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

/** A token click, the gear menu and Copy game link each complete their own step. */
export const PlayedThrough = meta.story({
  parameters: chapterParameters,
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const banner = await page.findByRole('banner', { name: 'Chapter 1: Welcome' }, { timeout: 60_000 });
    const rail = within(banner);
    const step = async (name: string) => {
      await waitForFrame(() => expect(rail.getByText(name).closest('li')).toHaveAttribute('data-state', 'current'));
      /* Let the new task's frame install its click or keyboard listener. */
      await waitForFrame(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    };
    const selection = () => document.querySelector('.scene-piece-count--selected')?.getAttribute('data-piece-id');
    const clickCanvas = async (clientX: number, clientY: number) => {
      const canvas = document.querySelector('canvas')!;
      const pointer = {
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, buttons: 1 }));
      await waitForFrame(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0 }));
      canvas.dispatchEvent(new MouseEvent('click', { ...pointer, buttons: 0 }));
    };
    const clickAt = async (point: readonly [number, number, number]) => {
      const canvas = document.querySelector('canvas')!;
      const camera = _roots.get(canvas)!.store.getState().camera;
      const projected = new Vector3(...point).project(camera);
      const bounds = canvas.getBoundingClientRect();
      const clientX = bounds.left + ((projected.x + 1) * bounds.width) / 2;
      const clientY = bounds.top + ((1 - projected.y) * bounds.height) / 2;
      await clickCanvas(clientX, clientY);
    };
    const { stored } = startAt(setup as unknown as TutorialSetup, 'turn-1-storm', window.location.origin);
    const token = stored.table.pieces.filter(isFactionToken).sort((a, b) => b.position[2] - a.position[2])[0]!;
    const tokenPoint = [token.position[0], token.position[1] + stackTopHeight(token), token.position[2]] as const;
    await waitForPlayCamera(document);
    await step('Hear the steps aloud');
    await userEvent.keyboard('{Enter}');
    await step('The board');
    await clickAt(tokenPoint);
    await waitForFrame(() => expect(selection(), 'The token is selected before its tutorial step.').toBe(token.id));
    await userEvent.keyboard('{Enter}');
    await step('The players');
    const canvas = document.querySelector('canvas')!;
    const bounds = canvas.getBoundingClientRect();
    await clickCanvas(bounds.right - 4, bounds.top + 4);
    await waitForFrame(() => expect(selection(), 'A background miss retains the earlier selection.').toBe(token.id));
    await step('The players');
    /* An earlier selection and Enter cannot do the new click task. */
    await userEvent.keyboard('{Enter}');
    await step('The players');
    await clickAt([0.8, TABLE_SURFACE_Y, 0.6]);
    await step('The players');
    await clickAt(tokenPoint);
    await step('Phase and turn');
    for (const next of ['The phases of a turn', 'The turn tracker', 'Advance to the next phase']) {
      await userEvent.keyboard('{Enter}');
      await step(next);
    }
    await userEvent.click(page.getByRole('button', { name: 'Next phase' }));
    await step('Open the game menu');
    await userEvent.keyboard('{Enter}');
    await step('Open the game menu');
    await expect(page.getByText('Spice Blow', { exact: true })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
    await step('Copy the game link');
    const writeText = spyOn(document.defaultView!.navigator.clipboard, 'writeText').mockResolvedValue();
    await userEvent.click(page.getByRole('button', { name: 'Copy game link' }));
    await expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/tutorial/welcome'));
    await waitForFrame(() => expect(page.queryByRole('menu')).toBeNull());
    await expect(await page.findByRole('dialog')).toBeVisible();
  },
});
