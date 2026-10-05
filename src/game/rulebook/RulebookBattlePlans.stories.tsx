import preview from '@sb/preview';

import { presciencePanel, renderedBattleStep } from './RulebookBattlePlan.stories.fixture';
import { RulebookBlockCanvas } from './RulebookBlockRenderer';

const meta = preview.meta({ title: 'Blocks/Battle plans/Rendered', parameters: { layout: 'centered' } });
export const HiddenAndKnownCards = meta.story({
  render: () => {
    const { left, right } = renderedBattleStep(presciencePanel, 0);
    return <RulebookBlockCanvas block={{ id: 'PLAN', kind: 'battle-plans', left, right, showSideLabels: false }} />;
  },
});
