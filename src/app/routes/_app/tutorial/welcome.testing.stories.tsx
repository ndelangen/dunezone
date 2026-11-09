import { _roots } from '@react-three/fiber/webgpu';
import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { isFactionToken } from '@shared/play/factionToken';
import { stackTopHeight, TABLE_SURFACE_Y } from '@shared/play/tableGeometry';
import { expect, fn, spyOn, userEvent, within } from 'storybook/test';
import { Vector3 } from 'three';

import { sceneTableLens } from '@app/widgets/tutorial-guide/tableLens';

import { pageStoryMeta } from '../../storybookConfig';
import { waitForPlayCamera } from '../play/mapView.stories.fixture';
import { welcome } from './chapterScripts/welcome';
import { chapterGlobals, chapterParameters } from './chapterStory';
import setup from './setup/setup.json';
import { startAt } from './setup/tutorialSetup';
import type { TutorialSetup } from './setup/tutorialSetup';

/* Each text is read in parts, sentence by sentence; a reading starts where the voice was last cancelled. */
const parts: string[][] = [];
const spoken = fn((utterance: SpeechSynthesisUtterance) => {
  parts.at(-1)?.push(utterance.text);
});
const cancelled = fn(() => {
  parts.push([]);
});
const readings = () => parts.filter((reading) => reading.length > 0);
const lastReading = () => readings().at(-1)?.join(' ') ?? '';
const preference = 'dunezone-tutorial:speaking-mode';
let welcomeReadiness: { report: () => string; stop: () => void } | undefined;

/*
 * "Welcome", as its page serves it: the table from the tutorial's recorded setup, running in the page,
 * with the rail beside it giving one task at a time. Its art comes from the recorded tutorial setup.
 */

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
    cancelled.mockClear();
    parts.length = 0;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak: spoken, cancel: cancelled, getVoices: () => [] },
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

/** The chapter as a player meets it: do what the rail says, where its arrow shows, and it moves on by itself. */
export const Chapter = meta.story({
  parameters: chapterParameters,
  globals: chapterGlobals,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const rail = await page.findByRole('banner', { name: 'Chapter 1: Welcome' }, { timeout: 60_000 });
    await expect(await within(rail).findByText('Welcome to the table', {}, { timeout: 60_000 })).toBeVisible();
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
    await waitForFrame(() => expect(readings()).toHaveLength(1), { timeout: 60_000 });
    const introduction = rail.getByText("Welcome! I'll show you around the table and help you get comfortable.");
    const shortcut = rail.getByText(/to turn speaking mode on or off/);
    const start = rail.getByText(/when you're ready to start\./);
    await expect(introduction.tagName).toBe('P');
    await expect(shortcut.tagName).toBe('P');
    await expect(start.tagName).toBe('P');
    await expect(shortcut.getBoundingClientRect().top).toBeGreaterThan(introduction.getBoundingClientRect().bottom);
    await expect(start.getBoundingClientRect().top).toBeGreaterThan(shortcut.getBoundingClientRect().bottom);
    /* All three paragraphs are read, each in its own sentences. */
    await expect(lastReading()).toMatch(/^Welcome! I'll show you around the table/);
    await expect(lastReading()).toMatch(/to turn speaking mode on or off/);
    await expect(lastReading()).toMatch(/when you're ready to start\.$/);
    const toggle = rail.getByRole('button', { name: 'Turn speaking mode on' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    /* This invitation intentionally pulses even with motion off. */
    await expect(getComputedStyle(toggle).animationName).not.toBe('none');
    await userEvent.keyboard('{Enter}');
    await waitForFrame(() =>
      expect(rail.getByText('Meet Arrakis').closest('li')).toHaveAttribute('data-state', 'current')
    );
    await waitForFrame(() =>
      expect(document.querySelector('[data-tutorial-pointer]')?.getAttribute('d') ?? '').toContain('Q')
    );
    await expect(readings()).toHaveLength(1);
    await expect(getComputedStyle(toggle).animationName).toBe('none');
    await userEvent.keyboard('z');
    await waitForFrame(() => expect(readings()).toHaveLength(2));
    await expect(lastReading()).toMatch(/^Here's Arrakis/);
    await expect(lastReading()).not.toMatch(/^Meet Arrakis/);
    await expect(rail.getByRole('button', { name: 'Turn speaking mode off' })).toHaveAttribute('aria-pressed', 'true');
    const title = rail.getByText('Meet Arrakis');
    const row = title.closest('li')!;
    const description = within(row).getByText(/Here's Arrakis/);
    const badge = row.querySelector('span')!;
    await expect(description.getBoundingClientRect().left).toBeCloseTo(row.getBoundingClientRect().left, 0);
    await expect(description.getBoundingClientRect().width).toBeCloseTo(row.getBoundingClientRect().width, 0);
    await expect(getComputedStyle(badge).fontFamily).toContain('C_Advokat_Modern');
    await expect(badge.getBoundingClientRect().width).toBeLessThan(30);
    await userEvent.keyboard('{Enter}');
    await waitForFrame(() => expect(readings()).toHaveLength(3));
    await expect(lastReading()).toMatch(/^These faction tokens around the board/);
    await userEvent.click(rail.getByRole('button', { name: 'Turn speaking mode off' }));
    await userEvent.click(rail.getByRole('button', { name: 'Reset' }));
    await waitForFrame(() =>
      expect(rail.getByText('Welcome to the table').closest('li')).toHaveAttribute('data-state', 'current')
    );
    await expect(rail.getByRole('button', { name: 'Turn speaking mode on' })).toHaveAttribute('aria-pressed', 'false');
    await expect(readings()).toHaveLength(3);
  },
});

/** A token click, the gear menu and Copy game link each complete their own step. */
export const PlayedThrough = meta.story({
  parameters: chapterParameters,
  beforeEach: () => {
    /* Observe the real readiness checks before mounting; #2627 needs to distinguish missing cameras from motion. */
    const startedAt = performance.now();
    const camera = sceneTableLens.camera;
    const settling = sceneTableLens.settling;
    const counts = { cameraReads: 0, missingCamera: 0, settlingRuns: 0, settlingSamples: 0, settledSamples: 0 };
    const samples: { atMs: number; cameraId: string; position: number[]; settled: boolean }[] = [];
    let observing = true;
    const cameraSpy = spyOn(sceneTableLens, 'camera').mockImplementation(() => {
      const result = camera();
      if (observing) {
        counts.cameraReads++;
        counts.missingCamera += Number(result === null);
      }
      return result;
    });
    const settlingSpy = spyOn(sceneTableLens, 'settling').mockImplementation(() => {
      const check = settling();
      if (observing) {
        counts.settlingRuns++;
      }
      return (camera) => {
        const settled = check(camera);
        if (observing) {
          counts.settlingSamples++;
          counts.settledSamples += Number(settled);
          samples.push({
            atMs: Math.round(performance.now() - startedAt),
            cameraId: camera.uuid,
            position: camera.position.toArray(),
            settled,
          });
          if (samples.length > 8) {
            samples.shift();
          }
        }
        return settled;
      };
    });
    const stop = () => {
      if (!observing) {
        return;
      }
      observing = false;
      cameraSpy.mockRestore();
      settlingSpy.mockRestore();
    };
    welcomeReadiness = {
      stop,
      report: () => JSON.stringify({ elapsedMs: Math.round(performance.now() - startedAt), ...counts, samples }),
    };
    return () => {
      stop();
      welcomeReadiness = undefined;
    };
  },
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
    const { stored } = startAt(setup as unknown as TutorialSetup, welcome.checkpoint, window.location.origin, welcome);
    const token = stored.table.pieces.filter(isFactionToken).sort((a, b) => b.position[2] - a.position[2])[0]!;
    const tokenPoint = [token.position[0], token.position[1] + stackTopHeight(token), token.position[2]] as const;
    await waitForPlayCamera(document);
    try {
      await step('Welcome to the table');
    } catch (error) {
      console.error('Welcome table readiness:', welcomeReadiness?.report());
      throw error;
    } finally {
      welcomeReadiness?.stop();
    }
    await userEvent.keyboard('{Enter}');
    await step('Meet Arrakis');
    await clickAt(tokenPoint);
    await waitForFrame(() => expect(selection(), 'The token is selected before its tutorial step.').toBe(token.id));
    await userEvent.keyboard('{Enter}');
    await step('Meet the players');
    const canvas = document.querySelector('canvas')!;
    const bounds = canvas.getBoundingClientRect();
    await clickCanvas(bounds.right - 4, bounds.top + 4);
    await waitForFrame(() => expect(selection(), 'A background miss retains the earlier selection.').toBe(token.id));
    await step('Meet the players');
    /* An earlier selection and Enter cannot do the new click task. */
    await userEvent.keyboard('{Enter}');
    await step('Meet the players');
    await clickAt([0.8, TABLE_SURFACE_Y, 0.6]);
    await step('Meet the players');
    await clickAt(tokenPoint);
    await step('Where are we in the game?');
    for (const next of ['See the phases', 'See the turn', 'Move to the next phase']) {
      await userEvent.keyboard('{Enter}');
      await step(next);
    }
    await userEvent.click(page.getByRole('button', { name: 'Next phase' }));
    await step('Open the game menu');
    await userEvent.keyboard('{Enter}');
    await step('Open the game menu');
    await expect(page.getByText('Spice Blow', { exact: true })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
    await step('Share the game');
    const writeText = spyOn(document.defaultView!.navigator.clipboard, 'writeText').mockResolvedValue();
    await userEvent.click(page.getByRole('button', { name: 'Copy game link' }));
    await expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/tutorial/welcome'));
    await waitForFrame(() => expect(page.queryByRole('menu')).toBeNull());
    await expect(await page.findByRole('dialog')).toBeVisible();
  },
});
