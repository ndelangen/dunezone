import preview from '@sb/preview';
import type { RulebookSize } from '@shared/rulebooks/settings';
import { expect } from 'storybook/test';

import { creditsFixture, referenceMatterPage, referenceTableFixture } from './RulebookReferenceMatter.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

function ReferenceMatterStory({
  treatment = 'table',
  size = 'a4',
}: Readonly<{ treatment?: 'table' | 'credits' | 'both' | 'empty'; size?: RulebookSize }>) {
  let blocks: Parameters<typeof referenceMatterPage>[0];
  if (treatment === 'table') {
    blocks = [referenceTableFixture()];
  } else if (treatment === 'credits') {
    blocks = [creditsFixture()];
  } else if (treatment === 'both') {
    blocks = [referenceTableFixture(), creditsFixture()];
  } else {
    blocks = [
      { ...referenceTableFixture(), columnOrder: [], columnsById: {}, rowOrder: [], rowsById: {}, note: '' },
      { ...creditsFixture(), groupOrder: [], groupsById: {} },
    ];
  }
  return (
    <div style={{ width: size === 'tall' ? 'min(24rem, 92vw)' : 'min(44rem, 92vw)' }}>
      <RulebookPageRenderer page={referenceMatterPage(blocks)} settings={{ size, design: 'illustrated' }} />
    </div>
  );
}

const meta = preview.meta({
  title: 'Reference matter',
  component: ReferenceMatterStory,
  args: { treatment: 'table', size: 'a4' },
  parameters: { layout: 'centered' },
});

async function expectContained({ canvasElement }: { canvasElement: HTMLElement }) {
  await document.fonts.ready;
  const region = canvasElement.querySelector('[data-rulebook-region]')!.getBoundingClientRect();
  for (const block of canvasElement.querySelectorAll('[data-rulebook-block-id]')) {
    const bounds = block.getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(region.left - 1);
    expect(bounds.right).toBeLessThanOrEqual(region.right + 1);
    expect(bounds.bottom).toBeLessThanOrEqual(region.bottom + 1);
  }
}

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

export const TallReferenceTable = meta.story({ args: { size: 'tall' }, play: expectContained });

export const Credits = meta.story({
  args: { treatment: 'credits' },
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

export const TableAndCredits = meta.story({ args: { treatment: 'both' }, play: expectContained });

export const EmptyBlocks = meta.story({
  args: { treatment: 'empty', size: 'square' },
  play: async (context) => {
    await expectContained(context);
    expect(context.canvasElement.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(2);
    expect(context.canvasElement.querySelector('th')).toBeNull();
    expect(context.canvasElement.querySelector('[data-rulebook-block-id="CRED"] h3')).toBeNull();
  },
});
