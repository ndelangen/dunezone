import preview from '@sb/preview';
import type { CSSProperties } from 'react';
import { expect, within } from 'storybook/test';

import { RulebookBattlePlan } from './RulebookBattlePlan';
import {
  deathPanel,
  planningPanel,
  presciencePanel,
  resultPanel,
  revealPanel,
} from './RulebookBattlePlan.stories.fixture';

type Specimen = 'private' | 'reveal' | 'resolution';

function BattleComicStory({ specimen = 'private' }: Readonly<{ specimen?: Specimen }>) {
  const panels =
    specimen === 'private'
      ? [presciencePanel, planningPanel, revealPanel, deathPanel]
      : specimen === 'reveal'
        ? [planningPanel, revealPanel, deathPanel]
        : [revealPanel, deathPanel, resultPanel];
  return (
    <div style={{ width: 'min(960px, 94vw)', containerType: 'inline-size' }}>
      <article
        data-battle-specimen={specimen}
        style={
          {
            '--rulebook-mm': '0.3921568627cqw',
            background: '#fffaee',
            color: '#21170f',
            boxSizing: 'border-box',
            minHeight: '99.6cqw',
            padding: '3.125cqw',
            fontFamily: 'Caladea, Georgia, serif',
          } as CSSProperties
        }
      >
        <header style={{ marginBottom: '1.6cqw' }}>
          <p style={{ margin: 0, fontSize: '1.26cqw', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            An illustrated battle
          </p>
          <h2 style={{ margin: '0.5cqw 0', fontSize: '2.5cqw' }}>Atreides against Harkonnen</h2>
        </header>
        <div style={{ display: 'grid', gap: '0.8cqw' }}>
          {panels.map((panel, index) => (
            <RulebookBattlePlan key={panel.step} {...panel} showSideLabels={index === 0} />
          ))}
        </div>
      </article>
    </div>
  );
}

const meta = preview.meta({
  title: 'Blocks/Battle comic/Rendered',
  component: BattleComicStory,
  args: { specimen: 'private' },
  parameters: { layout: 'centered' },
});

async function expectSquarePage(canvasElement: HTMLElement) {
  await document.fonts.ready;
  const page = canvasElement.querySelector('[data-battle-specimen]')!.getBoundingClientRect();
  expect(page.height).toBeLessThanOrEqual((page.width * 254) / 255 + 1);
}

export const PrivateInformation = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await expectSquarePage(canvasElement);
    await expect(canvas.getAllByLabelText('Harkonnen: battle plan hidden')).toHaveLength(2);
    await expect(
      within(canvas.getByRole('region', { name: 'Step 3: Ask with Battle Prescience' })).queryByAltText('Feyd Rautha')
    ).not.toBeInTheDocument();
    await expect(canvas.getAllByAltText('Gom Jabbar')).toHaveLength(4);
  },
});
export const RevealAndWeapons = meta.story({
  args: { specimen: 'reveal' },
  play: async ({ canvasElement }) => {
    await expectSquarePage(canvasElement);
  },
});
export const LeaderDeathAndResult = meta.story({
  args: { specimen: 'resolution' },
  play: async ({ canvas, canvasElement }) => {
    await expectSquarePage(canvasElement);
    await expect(canvas.getByText('3 + 4 = 7')).toBeVisible();
    await expect(canvas.getByText('4 + 0 = 4')).toBeVisible();
    await expect(canvas.getAllByText('Killed', { exact: true })).toHaveLength(2);
  },
});
