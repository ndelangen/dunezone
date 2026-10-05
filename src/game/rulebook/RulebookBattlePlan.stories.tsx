import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import {
  battleSequencePage,
  deathPanel,
  planningPanel,
  preparationPanel,
  presciencePanel,
  resultPanel,
  renderedBattleStep,
  revealPanel,
} from './RulebookBattlePlan.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

type Specimen = 'private' | 'reveal' | 'resolution' | 'troops';

const specimenPanels = {
  private: [presciencePanel, planningPanel, revealPanel],
  reveal: [planningPanel, revealPanel, deathPanel],
  resolution: [revealPanel, deathPanel, resultPanel],
};

function battleSpecimenPage(specimen: Exclude<Specimen, 'troops'>) {
  const page = battleSequencePage([]);
  page.regions[0].blocks = specimenPanels[specimen].map((panel, index) => {
    const block = renderedBattleStep(panel, index);
    block.left.troops[0]!.uncommitted = 2;
    block.right.troops[0]!.uncommitted = 1;
    return block;
  });
  return page;
}

function troopSpecimenPage() {
  const front = renderedBattleStep(revealPanel, 0);
  front.title = 'Mixed troop groups';
  front.caption = 'Supported starred troops and unsupported ordinary troops have separate readouts.';
  const ordinary = front.left.troops[0]!;
  front.left.troops = [
    { ...ordinary, supported: 0, unsupported: 2 },
    {
      ...ordinary,
      id: 'starred',
      supported: 1,
      unsupported: 0,
      artwork: {
        ...ordinary.artwork!,
        name: 'Starred troops',
        star: '/vector/troop_modifier/star-right.svg',
        back: { image: '/vector/troop/atreides.svg', name: 'Reverse face', description: '', striped: true },
      },
    },
  ];
  const reverse = structuredClone(front);
  reverse.id = 'reverse';
  reverse.step = '2';
  reverse.title = 'A selected reverse face';
  reverse.caption = 'The troop group keeps its own counts when its reverse artwork is selected.';
  reverse.left.troops[1]!.face = 'back';
  const missing = structuredClone(reverse);
  missing.id = 'unavailable';
  missing.step = '3';
  missing.title = 'Unavailable artwork';
  missing.caption = 'Missing artwork is identified, while the authored support counts remain readable.';
  missing.left.troops[1]!.artwork = undefined;
  missing.right.faction = { status: 'unavailable', factionId: 'removed-faction' };
  const page = battleSequencePage([]);
  page.regions[0].blocks = [front, reverse, missing];
  return page;
}

function BattleComicStory({ specimen = 'private' }: Readonly<{ specimen?: Specimen }>) {
  const page = specimen === 'troops' ? troopSpecimenPage() : battleSpecimenPage(specimen);
  return (
    <div style={{ width: 'min(960px, 94vw)' }}>
      <RulebookPageRenderer page={page} settings={{ size: 'square', design: 'illustrated' }} />
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
  const page = canvasElement.querySelector('[data-rulebook-page]')!.getBoundingClientRect();
  const region = canvasElement.querySelector<HTMLElement>('[data-rulebook-region]')!;
  expect(region.scrollHeight).toBeLessThanOrEqual(region.clientHeight + 1);
  const bottom = region.getBoundingClientRect().bottom;
  for (const block of region.querySelectorAll('[data-rulebook-block-id]')) {
    expect(block.getBoundingClientRect().bottom).toBeLessThanOrEqual(bottom + 1);
  }
  expect(page.height).toBeLessThanOrEqual((page.width * 254) / 255 + 1);
}

export const PrivateInformation = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await expectSquarePage(canvasElement);
    await expect(canvas.getAllByLabelText('Harkonnen: battle plan hidden')).toHaveLength(2);
    await expect(
      within(canvas.getByRole('region', { name: 'Step 3: Ask with Battle Prescience' })).queryByAltText('Feyd Rautha')
    ).not.toBeInTheDocument();
    await expect(canvas.getAllByAltText('Gom Jabbar')).toHaveLength(3);
    await expect(canvas.getAllByLabelText('Atreides: uncommitted troops')).toHaveLength(2);
    await expect(canvas.getAllByLabelText('Harkonnen: uncommitted troops')).toHaveLength(1);
    await expect(canvas.getAllByLabelText('Atreides: uncommitted troops')[0]).toHaveTextContent('Uncommitted: 2');
    await expect(
      within(canvas.getByRole('region', { name: 'Step 3: Ask with Battle Prescience' })).queryByText('Uncommitted:')
    ).not.toBeInTheDocument();
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
    await expect(canvas.getAllByRole('img', { name: 'Killed' })).toHaveLength(2);
  },
});

export const TroopGroupsAndReverseFaces = meta.story({
  args: { specimen: 'troops' },
  play: async ({ canvas, canvasElement }) => {
    await expectSquarePage(canvasElement);
    await expect(canvas.getByLabelText('Starred troops')).toBeVisible();
    await expect(canvas.getByLabelText('Reverse face')).toBeVisible();
    await expect(canvas.getByText('Troop artwork unavailable: 1 supported, 0 unsupported.')).toBeVisible();
    await expect(canvas.getByText('Faction artwork unavailable')).toBeVisible();
  },
});

export const IndependentExamples = meta.story({
  render: () => {
    const left = { ...renderedBattleStep(revealPanel, 0), title: 'A living leader' };
    const right = { ...renderedBattleStep(deathPanel, 1), title: 'A killed leader' };
    const page = battleSequencePage([]);
    page.title = 'Comparing independent examples';
    page.regions[0]!.blocks = [{ id: 'comparison', kind: 'battle-comparison', examples: [left, right] }];
    return (
      <div style={{ width: 'min(960px, 94vw)' }}>
        <RulebookPageRenderer page={page} settings={{ size: 'square', design: 'illustrated' }} />
      </div>
    );
  },
  play: async ({ canvas, canvasElement }) => {
    await expectSquarePage(canvasElement);
    const left = canvas.getByRole('region', { name: 'A living leader' });
    const right = canvas.getByRole('region', { name: 'A killed leader' });
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();
    const leftBox = left.getBoundingClientRect();
    const rightBox = right.getBoundingClientRect();
    expect(Math.abs(leftBox.top - rightBox.top)).toBeLessThan(1);
    expect(leftBox.right).toBeLessThan(rightBox.left);
    expect(canvas.queryByRole('region', { name: /^Step / })).not.toBeInTheDocument();
  },
});

export const PreparingThenUsingPrescience = meta.story({
  render: () => (
    <RulebookPageRenderer
      page={battleSequencePage([preparationPanel, presciencePanel])}
      settings={{ size: 'square', design: 'illustrated' }}
    />
  ),
  play: async ({ canvas, canvasElement }) => {
    await expectSquarePage(canvasElement);
    const preparation = within(canvas.getByRole('region', { name: 'Step 2: Prepare a battle plan' }));
    const prescience = within(canvas.getByRole('region', { name: 'Step 3: Ask with Battle Prescience' }));
    expect(
      preparation.queryByLabelText('Atreides: illustrative hidden cards; the opponent does not know their number')
    ).not.toBeInTheDocument();
    expect(preparation.getAllByAltText('Hidden card')).toHaveLength(2);
    expect(preparation.queryByAltText('Gom Jabbar')).not.toBeInTheDocument();
    expect(
      within(
        prescience.getByLabelText('Atreides: illustrative hidden cards; the opponent does not know their number')
      ).getAllByAltText('Hidden card')
    ).toHaveLength(2);
    expect(prescience.getAllByAltText('Hidden card')).toHaveLength(3);
    expect(prescience.getByAltText('Gom Jabbar')).toBeVisible();
    expect(prescience.queryByAltText('Maula Pistol')).not.toBeInTheDocument();
    expect(prescience.queryByAltText('Snooper')).not.toBeInTheDocument();
  },
});
