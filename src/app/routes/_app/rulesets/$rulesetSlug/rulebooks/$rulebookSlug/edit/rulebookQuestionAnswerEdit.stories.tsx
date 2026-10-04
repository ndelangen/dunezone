import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { questionAnswerChange, QuestionAnswerStory } from './rulebookBlockEditors.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Question and answer/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const QuestionAndAnswer = meta.story({
  render: () => (
    <QuestionAnswerStory
      initialValue={{
        topic: 'Movement',
        question: 'Can a force cross the storm?',
        answer: 'It cannot move into or through the storm.',
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Answer' }), ' Faction abilities can change this.');
    expect(questionAnswerChange.mock.lastCall?.[0].answer).toContain('Faction abilities can change this.');
  },
});
