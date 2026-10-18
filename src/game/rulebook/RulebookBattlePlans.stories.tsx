import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { presciencePanel, renderedBattleStep } from './RulebookBattlePlan.stories.fixture';
import { RulebookBlockCanvas } from './RulebookBlockRenderer';

const meta = preview.meta({ title: 'Blocks/Battle plans/Rendered', parameters: { layout: 'centered' } });
export const HiddenAndKnownCards = meta.story({
  render: () => {
    const { left, right } = renderedBattleStep(presciencePanel, 0);
    return <RulebookBlockCanvas block={{ id: 'PLAN', kind: 'battle-plans', left, right, showSideLabels: false }} />;
  },
  play: async ({ canvasElement }) => {
    const plans = canvasElement.querySelector('.rulebookBattlePlans')!.getBoundingClientRect();
    const sides = canvasElement.querySelectorAll('.rulebookBattleSide');
    await expect(sides).toHaveLength(2);
    const left = sides[0]!.getBoundingClientRect();
    const right = sides[1]!.getBoundingClientRect();
    await expect(left.left).toBeCloseTo(plans.left, 1);
    await expect(right.right).toBeCloseTo(plans.right, 1);
    await expect(left.width).toBeCloseTo(right.width, 1);
  },
});
