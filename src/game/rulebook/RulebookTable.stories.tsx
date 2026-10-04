import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { TableStory, expectContained, expectWholeWords } from './RulebookReferenceMatter.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Table/Rendered',
  component: TableStory,
  args: { size: 'a4' },
  parameters: { layout: 'centered' },
});

export const ReferenceTable = meta.story({
  play: async (context) => {
    await expectContained(context);
    const table = context.canvasElement.querySelector('table')!;
    const headers = [...table.querySelectorAll('th')].map((cell) => cell.textContent);
    expect(headers).toEqual(['Faction', 'Starting spice', 'Forces on Dune', 'Free revival']);
    const rows = [...table.querySelectorAll('tbody tr')];
    expect(rows.map((row) => row.getAttribute('data-rulebook-item-id'))).toEqual([
      'ATRE',
      'HARK',
      'FREM',
      'EMPR',
      'GUIL',
      'BENE',
    ]);
    /* The Emperor row stores no Forces cell, and the rendered row still carries one cell per column. */
    const emperor = rows[3]!.querySelectorAll('td');
    expect(emperor).toHaveLength(4);
    expect(emperor[2]!.getAttribute('data-rulebook-column-id')).toBe('FRCE');
    expect(emperor[2]!.textContent).toBe('');
    expect(context.canvasElement.textContent).toContain('Forces not listed on Dune begin in reserve');
  },
});

export const TallReferenceTable = meta.story({
  args: { size: 'tall' },
  play: async (context) => {
    await expectContained(context);
    expectWholeWords(context.canvasElement);
  },
});
