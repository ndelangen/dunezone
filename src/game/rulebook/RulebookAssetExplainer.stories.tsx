import preview from '@sb/preview';
import type { RulebookSettings } from '@shared/rulebooks/settings';
import { expect } from 'storybook/test';

import {
  boardExplainerFixture,
  explainerPage,
  incompleteExplainerFixture,
  leaderExplainerFixture,
} from './RulebookAssetExplainer.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

function ExplainerStory({
  specimen = 'board',
  size = 'a4',
  design = 'illustrated',
}: Readonly<Partial<RulebookSettings> & { specimen?: 'board' | 'leader' | 'unavailable' }>) {
  const block =
    specimen === 'board'
      ? boardExplainerFixture()
      : specimen === 'leader'
        ? leaderExplainerFixture()
        : incompleteExplainerFixture();
  return (
    <div style={{ width: size === 'tall' ? 'min(24rem, 92vw)' : 'min(44rem, 92vw)' }}>
      <RulebookPageRenderer page={explainerPage(block)} settings={{ size, design }} />
    </div>
  );
}

const meta = preview.meta({
  title: 'Asset explainer',
  component: ExplainerStory,
  args: { specimen: 'board', size: 'a4', design: 'illustrated' },
  parameters: { layout: 'centered' },
});

async function expectContained({ canvasElement }: { canvasElement: HTMLElement }) {
  await document.fonts.ready;
  const region = canvasElement.querySelector('[data-rulebook-region]')!.getBoundingClientRect();
  const block = canvasElement.querySelector('[data-rulebook-explainer]')!.getBoundingClientRect();
  expect(block.left).toBeGreaterThanOrEqual(region.left - 1);
  expect(block.right).toBeLessThanOrEqual(region.right + 1);
  expect(block.bottom).toBeLessThanOrEqual(region.bottom + 1);
  expect(canvasElement.querySelectorAll('ol[aria-label="Explanations"]')).toHaveLength(1);
}

export const Strongholds = meta.story({
  play: async (context) => {
    await expectContained(context);
    expect(context.canvasElement.querySelectorAll('[data-rulebook-marker]')).toHaveLength(6);
    expect(context.canvasElement.querySelectorAll('[data-rulebook-highlight]')).not.toHaveLength(0);
  },
});
export const LeaderAnatomy = meta.story({
  args: { specimen: 'leader', size: 'square' },
  play: async (context) => {
    await expectContained(context);
    expect(context.canvasElement.querySelectorAll('line')).toHaveLength(4);
    expect(context.canvasElement.querySelectorAll('[data-rulebook-highlight]')).toHaveLength(0);
  },
});
export const UnavailableAndPositionedTargets = meta.story({
  args: { specimen: 'unavailable', size: 'tall', design: 'restrained' },
  play: async (context) => {
    await expectContained(context);
    expect(context.canvasElement.querySelectorAll('[data-rulebook-marker]')).toHaveLength(2);
    expect(context.canvasElement.querySelector('[data-target-status="part-unavailable"]')).not.toBeNull();
    expect(context.canvasElement.querySelector('[data-target-status="source-replaced"]')).not.toBeNull();
  },
});
