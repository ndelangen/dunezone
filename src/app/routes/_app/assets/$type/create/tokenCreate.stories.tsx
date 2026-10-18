import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from '../../../../storybookConfig';

/* The token create page as it is served, which is the layout the editor's own stories reproduce. */
const meta = preview.meta({ ...pageStoryMeta, title: 'Assets/Token editor' });

/**
 * A blank workbench is mounted once its Name field reads empty and its chapters are offered.
 * A disc carries rim labels, so its blank page warns that one is missing, and a pointer carries none, so it never does.
 */
const blankWorkbench =
  (labelled: boolean) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 })).resolves.toHaveValue('');
    const chapters = within(page.getByRole('tablist', { name: 'Token chapters' }));
    await expect(chapters.getByRole('tab', { name: 'Front face' })).toBeVisible();
    const labelWarning = page.queryByRole('button', { name: 'Front rim: missing any label' });
    await (labelled ? expect(labelWarning).toBeVisible() : expect(labelWarning).toBeNull());
  };

/** A disc token's blank page: the shape every other token editor is adapted from. */
export const Disc = meta.story({ args: { path: '/assets/token-disc/create' }, play: blankWorkbench(true) });

/** A pointer token's blank page: the same workbench, every proof cut to the teardrop. */
export const Pointer = meta.story({ args: { path: '/assets/token-pointer/create' }, play: blankWorkbench(false) });
