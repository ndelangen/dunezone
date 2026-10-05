import preview from '@sb/preview';
import type { CSSProperties } from 'react';
import { expect } from 'storybook/test';

import { RulebookBattlePlan } from './RulebookBattlePlan';
import { atreidesPlan, emperorLeader, harkonnenPlan } from './RulebookBattlePlan.stories.fixture';

type Specimen = 'mixed' | 'supported' | 'unsupported' | 'starred' | 'revealed' | 'resolved' | 'losses';

function BattlePlanStory({ specimen = 'revealed' }: Readonly<{ specimen?: Specimen }>) {
  const paired = specimen === 'revealed' || specimen === 'resolved' || specimen === 'losses';
  const resolved = specimen === 'resolved' || specimen === 'losses';
  const plan = {
    ...atreidesPlan,
    ...(specimen === 'supported'
      ? { troops: [{ label: 'Supported', count: 4, strengthEach: 1, spiceEach: 1 }] }
      : specimen === 'unsupported'
        ? { troops: [{ label: 'Unsupported', count: 4, strengthEach: 0.5, spiceEach: 0 }] }
        : specimen === 'starred'
          ? {
              title: 'Emperor against a non-Fremen opponent',
              color: '#a9342b',
              troopIcon: '/vector/troop/emperor.svg',
              troops: [
                { label: 'Supported starred troops', count: 2, strengthEach: 2, spiceEach: 1, starred: true },
                { label: 'Unsupported starred troops', count: 2, strengthEach: 1, spiceEach: 0, starred: true },
              ],
              uncommitted: 0,
              leader: emperorLeader,
            }
          : {}),
  };
  const headings = {
    mixed: 'Four troops. Three strength. Two spice.',
    supported: 'Support every committed troop',
    unsupported: 'Commit troops without spice',
    starred: 'Count strength, not troop tokens',
    revealed: 'Reveal both battle plans',
    resolved: 'Resolve weapons before adding strength',
    losses: 'Count the troops lost',
  };
  const introductions = {
    mixed:
      'Two supported troops contribute 2 strength. Two unsupported troops contribute 1. The other two troops stay out of the dial.',
    supported:
      'Four ordinary troops each contribute 1 strength and cost 1 spice. The dial is 4 and the support costs 4 spice.',
    unsupported: 'Four ordinary troops each contribute half strength. The dial is 2 and the support costs no spice.',
    starred:
      'Against a faction other than Fremen, Sardaukar contribute 2 strength when supported and 1 when unsupported. Each supported Sardaukar costs only 1 spice.',
    revealed:
      'Atreides used Battle Prescience to learn that Harkonnen would play a poison weapon, then chose a Snooper. Both players now reveal. Neither calls a traitor.',
    resolved:
      'Atreides blocks Gom Jabbar with a Snooper. The Maula Pistol kills Feyd Rautha: a Snooper does not stop projectiles. Feyd contributes no strength; his troops still do.',
    losses:
      'Atreides wins 7 to 4, losing the four troops committed to the dial. Harkonnen loses all five troops in the territory, including the one left out of the dial.',
  };
  return (
    <div style={{ width: paired ? 'min(900px, 94vw)' : 'min(470px, 94vw)', containerType: 'inline-size' }}>
      <article
        data-battle-specimen={specimen}
        style={
          {
            '--rulebook-mm': paired ? '0.3921568627cqw' : '0.75cqw',
            background: '#fffaee',
            color: '#21170f',
            boxSizing: 'border-box',
            minHeight: paired ? '99.6cqw' : undefined,
            padding: '5cqw',
            fontFamily: 'Caladea, Georgia, serif',
          } as CSSProperties
        }
      >
        <header style={{ borderBottom: '2px solid #b3a574', marginBottom: '3cqw', paddingBottom: '3cqw' }}>
          <p style={{ margin: 0, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Battle example
          </p>
          <h2 style={{ margin: '1cqw 0', fontSize: paired ? '3.5cqw' : '5cqw' }}>{headings[specimen]}</h2>
          <p style={{ margin: 0, fontSize: paired ? '1.8cqw' : '3.2cqw', lineHeight: 1.4 }}>
            {introductions[specimen]}
          </p>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: paired ? '1fr 1fr' : '1fr', gap: '5cqw' }}>
          <RulebookBattlePlan {...plan} resolved={resolved} losses={specimen === 'losses' ? 4 : undefined} />
          {paired ? (
            <RulebookBattlePlan {...harkonnenPlan} resolved={resolved} losses={specimen === 'losses' ? 5 : undefined} />
          ) : null}
        </div>
        {resolved ? (
          <p style={{ margin: '2.5cqw 0 0', padding: '2cqw', background: '#e9d599', fontSize: '1.8cqw' }}>
            {specimen === 'losses'
              ? 'Both sides pay the spice committed. Atreides pays 2; Harkonnen pays 4. Card exchange and other aftermath effects are separate steps.'
              : 'Atreides wins with 7 strength against 4. Killing a leader removes their contribution; it does not by itself decide the winner.'}
          </p>
        ) : null}
      </article>
    </div>
  );
}

const meta = preview.meta({
  title: 'Blocks/Battle plan/Rendered',
  component: BattlePlanStory,
  args: { specimen: 'revealed' },
  parameters: { layout: 'centered' },
});

export const Reveal = meta.story({});
export const MixedSupport = meta.story({ args: { specimen: 'mixed' } });
export const FullySupported = meta.story({ args: { specimen: 'supported' } });
export const Unsupported = meta.story({ args: { specimen: 'unsupported' } });
export const StarredTroops = meta.story({ args: { specimen: 'starred' } });
export const LeaderDeath = meta.story({
  args: { specimen: 'resolved' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('3 + 4 = 7')).toBeVisible();
    await expect(canvas.getByText('4 + 0 = 4')).toBeVisible();
    await expect(canvas.getByText('Killed', { exact: true })).toBeVisible();
  },
});
export const TroopLosses = meta.story({
  args: { specimen: 'losses' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('4 troops to the Tanks. 2 remain.')).toBeVisible();
    await expect(canvas.getByText('5 troops to the Tanks. 0 remain.')).toBeVisible();
  },
});
