import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { CreditsStory, expectContained } from './RulebookReferenceMatter.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Credits/Rendered',
  component: CreditsStory,
  args: { size: 'a4' },
  parameters: { layout: 'centered' },
});

export const Credits = meta.story({
  play: async (context) => {
    await expectContained(context);
    const groups = [...context.canvasElement.querySelectorAll('[data-rulebook-block-id="CRED"] h3')];
    expect(groups.map((heading) => heading.textContent)).toEqual([
      'Game design',
      'Artwork and typesetting',
      'Rules compilation',
    ]);
    const contributors = [...context.canvasElement.querySelectorAll('[data-rulebook-block-id="CRED"] li')];
    expect(contributors.map((item) => item.getAttribute('data-rulebook-item-id'))).toEqual([
      'EBER',
      'KITT',
      'OLOT',
      'ILLU',
      'TYPE',
      'EDIT',
    ]);
    expect(contributors[3]!.textContent).toBe('Dune ZoneBoard and card rendering');
  },
});
