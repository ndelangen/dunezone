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
  play: ({ canvasElement }) => {
    const plans = canvasElement.querySelector('.rulebookBattlePlans')!.getBoundingClientRect();
    const sides = canvasElement.querySelectorAll('.rulebookBattleSide');
    expect(sides).toHaveLength(2);
    const left = sides[0]!.getBoundingClientRect();
    const right = sides[1]!.getBoundingClientRect();
    expect(left.left).toBeCloseTo(plans.left, 1);
    expect(right.right).toBeCloseTo(plans.right, 1);
    expect(left.width).toBeCloseTo(right.width, 1);
  },
});
