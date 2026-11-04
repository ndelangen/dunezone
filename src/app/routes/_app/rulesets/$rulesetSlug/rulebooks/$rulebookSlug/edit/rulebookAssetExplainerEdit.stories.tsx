import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import {
  leaderExplainerFixture,
  savedBoardExplainerFixture,
} from '@game/rulebook/RulebookAssetExplainer.stories.fixture';

import { ExplainerStory } from './rulebookAssetExplainerEdit.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Annotated component/Editing',
  parameters: { layout: 'fullscreen' },
});
export const MissingSource = meta.story({
  render: () => <ExplainerStory initial={leaderExplainerFixture()} unavailable />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Unavailable source' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Explanation' })).toHaveValue(
      leaderExplainerFixture().items[0]!.text
    );
    await expect(canvas.getByRole('combobox', { name: 'Part of the component' })).toHaveValue('Portrait (unavailable)');
  },
});

export const ReplacedSource = meta.story({
  render: () => {
    const initial = leaderExplainerFixture();
    return (
      <ExplainerStory
        initial={{
          ...initial,
          items: initial.items.map((item) => ({
            ...item,
            target: { ...item.target, source: { kind: 'board', boardId: 'arrakis' } },
          })),
        }}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      portal = within(canvasElement.ownerDocument.body);
    const part = canvas.getByRole('combobox', { name: 'Part of the component' });
    await expect(part).toHaveAttribute('placeholder', 'Portrait (previous source)');
    await expect(canvas.getByRole('button', { name: '1. Portrait (unavailable)' })).toBeVisible();
    await userEvent.click(part);
    await userEvent.click(portal.getByRole('option', { name: 'Portrait' }));
    await expect(canvas.getByRole('button', { name: '1. Portrait' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Explanation' })).toHaveValue(
      leaderExplainerFixture().items[0]!.text
    );
  },
});

/** Sector lines are off by default; turning them on draws the board's storm sector lines faintly in the preview. */
export const SectorLines = meta.story({
  render: () => <ExplainerStory initial={savedBoardExplainerFixture()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch', { name: 'Sector lines' });
    await expect(toggle).not.toBeChecked();
    await expect(canvasElement.querySelectorAll('[data-rulebook-guide]')).toHaveLength(0);
    await userEvent.click(toggle);
    await expect(toggle).toBeChecked();
    await expect(canvasElement.querySelectorAll('[data-rulebook-guide="sectors"]')).toHaveLength(18);
    await userEvent.click(toggle);
    await expect(toggle).not.toBeChecked();
    await expect(canvasElement.querySelectorAll('[data-rulebook-guide]')).toHaveLength(0);
  },
});

/** Only a board has storm sectors, so other sources show no Sector lines switch. */
export const NoSectorLinesForComponents = meta.story({
  render: () => <ExplainerStory initial={leaderExplainerFixture()} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('switch', { name: 'Sector lines' })).toBeNull();
  },
});
