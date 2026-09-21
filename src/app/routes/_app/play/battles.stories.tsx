import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { refText, SEED_REF_TOKEN } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { GameRuntimeContext } from './multiplayer/gameRuntime';
import {
  activateRuntime,
  battleStory,
  expectBattleCalloutPlacement,
  openTab,
  session as playingSession,
  settled,
} from './playing.stories.fixture';
import {
  cardBack,
  GAME_KEY,
  productTransport as hostedStoryTransport,
  imageHref,
  parameters,
} from './product.stories.fixture';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Playing/Battles',
  args: { path: refText(GAME_KEY, `/play/${SEED_REF_TOKEN}`) },
  decorators: [
    (Story) => (
      <GameRuntimeContext value={playingSession.runtime}>
        <Story />
      </GameRuntimeContext>
    ),
  ],
});

export const BattleCalloutBelowNorthernTerritory = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    const snapshot = battleStory('preparing');
    snapshot.battle!.anchor = [3.6, 0.18, -3.05];
    playingSession.transport = hostedStoryTransport('neutral', snapshot);
    return activateRuntime();
  },
  play: async ({ canvasElement }) => expectBattleCalloutPlacement(canvasElement, [3.6, 0.18, -3.05], 'below'),
});

export const BattleCalloutAboveSouthernTerritory = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    const snapshot = battleStory('preparing');
    snapshot.battle!.anchor = [3.6, 0.18, 3.05];
    playingSession.transport = hostedStoryTransport('neutral', snapshot);
    return activateRuntime();
  },
  play: async ({ canvasElement }) => expectBattleCalloutPlacement(canvasElement, [3.6, 0.18, 3.05], 'above'),
});

export const BattleUnclaimed = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    const snapshot = battleStory('preparing');
    snapshot.battle!.sides = [null, null];
    snapshot.battlePlan = null;
    playingSession.transport = hostedStoryTransport('seat-2', snapshot);
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() => expect(page.getByRole('button', { name: 'Claim left side' })).toBeEnabled());
    const claim = page.getByRole('button', { name: 'Claim left side' });
    const bounds = claim.getBoundingClientRect();
    expect(bounds.width).toBe(bounds.height);
    expect(getComputedStyle(claim).borderRadius).toBe('50%');
    await userEvent.click(claim);
    expect(
      [...playingSession.transport.messages].reverse().find((message) => message.type === 'command')?.action
    ).toEqual({
      kind: 'battle-claim',
      battleId: 'story-battle',
      side: 0,
    });
  },
});

export const BattleOneClaimed = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    const snapshot = battleStory('preparing');
    snapshot.battle!.sides = [null, { factionId: 'house-atreides', ready: false, choice: null }];
    snapshot.battlePlan = null;
    playingSession.transport = hostedStoryTransport('seat-2', snapshot);
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() => expect(page.getByRole('button', { name: 'Cancel battle' })).toBeEnabled());
    const faction = page.getByRole('img', { name: 'house-atreides, right side, Preparing' });
    expect(faction).toBeVisible();
    expect(faction.textContent).toBe('');
    const cancel = page.getByRole('button', { name: 'Cancel battle' });
    const shape = getComputedStyle(cancel);
    expect(parseFloat(shape.borderBottomLeftRadius)).toBeGreaterThan(parseFloat(shape.borderTopLeftRadius));
    expect(shape.borderBottomLeftRadius).toBe(shape.borderBottomRightRadius);
    await userEvent.click(cancel);
    expect(
      [...playingSession.transport.messages].reverse().find((message) => message.type === 'command')?.action
    ).toEqual({
      kind: 'battle-cancel',
      battleId: 'story-battle',
    });
  },
});

export const BattleReadiness = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('neutral', battleStory('preparing', true));
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() =>
      expect(page.getByRole('img', { name: 'house-harkonnen, left side, aggressor, Preparing' })).toBeVisible()
    );
    const preparing = page.getByRole('img', { name: 'house-harkonnen, left side, aggressor, Preparing' });
    const ready = page.getByRole('img', { name: 'house-atreides, right side, Ready' });
    expect(ready).toBeVisible();
    const preparingRing = preparing.querySelector('svg[data-ready]')!;
    const readyRing = ready.querySelector('svg[data-ready]')!;
    expect(preparingRing).toBeVisible();
    expect(readyRing).toBeVisible();
    expect(getComputedStyle(readyRing).stroke).not.toBe(getComputedStyle(preparingRing).stroke);
    expect(getComputedStyle(readyRing).animationName).toBe('none');
    expect(page.getByRole('button', { name: 'Cancel battle' })).toBeDisabled();
  },
});

export const BattlePlanner = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    const snapshot = battleStory('preparing');
    const card = snapshot.table.pieces.find((piece) => piece.kind === 'card' && piece.items.length === 1)!;
    card.items[0].artwork = {
      front: imageHref('/play-fixtures/dreamrules/snooper.jpg'),
      back: cardBack(),
      name: 'Snooper',
      type: 'card-treachery',
    };
    snapshot.hand = [card];
    snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece.id !== card.id);
    playingSession.transport = hostedStoryTransport('seat-2', snapshot);
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() => expect(page.getByRole('button', { name: 'Ready for battle' })).toBeEnabled());
    await settled(() => {
      expect(page.getByRole('textbox', { name: 'Harkonnen Troop' })).toBeEnabled();
      expect(page.queryByText(/house-harkonnen reverse/i)).toBeNull();
      expect(page.queryByRole('region', { name: 'Battle results' })).toBeNull();
    });

    const wheel = await page.findByLabelText(
      'house-harkonnen plan, troop strength 0, 0 spice',
      {},
      { timeout: 30_000 }
    );
    await settled(() => expect(page.getByRole('textbox', { name: 'Committed spice' })).toBeEnabled());
    let sticky: HTMLElement | null = wheel.parentElement;
    while (sticky && getComputedStyle(sticky).position !== 'sticky') {
      sticky = sticky.parentElement;
    }
    expect(sticky).not.toBeNull();

    const card = await page.findByRole('button', { name: 'Add Snooper to battle plan' }, { timeout: 30_000 });
    expect(card).toHaveAttribute('aria-pressed', 'false');
    expect(within(card).getByRole('img', { name: 'Snooper' })).toBeInTheDocument();
    await userEvent.click(card);
    const saved = [...playingSession.transport.messages].reverse().find((message) => message.type === 'command');
    expect(saved?.action).toMatchObject({
      kind: 'battle-plan',
      plan: { cardIds: ['treachery-card-loose'] },
    });
    const currentWheel = page.getByLabelText(/^house-harkonnen plan,/);
    expect(within(currentWheel).getByRole('img', { name: 'Snooper' })).toBeInTheDocument();
  },
});

export const BattleReady = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('seat-2', battleStory('preparing'));
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() => expect(page.getByRole('button', { name: 'Ready for battle' })).toBeEnabled());
    await userEvent.click(page.getByRole('button', { name: 'Ready for battle' }));
    expect(
      [...playingSession.transport.messages].reverse().find((message) => message.type === 'command')?.action
    ).toEqual({
      kind: 'battle-ready',
      battleId: 'story-battle',
      ready: true,
    });
  },
});

export const BattleSpiceBound = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    const snapshot = battleStory('preparing');
    snapshot.bank!.balance = 2;
    playingSession.transport = hostedStoryTransport('seat-2', snapshot);
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(async () => {
      const spice = page.getByRole('textbox', { name: 'Committed spice' });
      await userEvent.clear(spice);
      await userEvent.type(spice, '9');
      await userEvent.keyboard('{Enter}');
      expect(
        [...playingSession.transport.messages].reverse().find((message) => message.type === 'command')?.action
      ).toMatchObject({
        kind: 'battle-plan',
        plan: { spice: 2 },
      });
    });
    await settled(() => expect(page.getByText(/0 available in your bank, 2 reserved/)).toBeVisible());
  },
});

export const BattleCustomSpiceBound = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    const snapshot = battleStory('preparing');
    snapshot.bank!.balance = 2;
    snapshot.battlePlan!.mode = 'custom';
    playingSession.transport = hostedStoryTransport('seat-2', snapshot);
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(async () => {
      const dialed = page.getByRole('textbox', { name: 'Dialed' });
      await userEvent.clear(dialed);
      await userEvent.type(dialed, '9');
      await userEvent.keyboard('{Enter}');
      expect(
        [...playingSession.transport.messages].reverse().find((message) => message.type === 'command')?.action
      ).toMatchObject({
        kind: 'battle-plan',
        plan: { troops: [{ faceId: 'house-harkonnen-front', undialed: 0, dialed: 2 }] },
      });
    });
  },
});

export const BattleCountdown = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('seat-2', battleStory('countdown'));
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() => expect(page.getByRole('button', { name: 'Undo Ready' })).toBeEnabled());
    expect(page.getByRole('textbox', { name: 'Committed spice' })).toBeDisabled();
    expect(page.queryByRole('button', { name: 'Cancel battle' })).toBeNull();
  },
});

export const BattleObserver = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('neutral', battleStory('revealed', true));
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() => expect(page.getByRole('button', { name: 'No winner' })).toBeDisabled());
    expect(page.queryByRole('textbox', { name: 'Committed spice' })).toBeNull();
    expect(page.queryByRole('region', { name: 'Your hand and leaders' })).toBeNull();
  },
});

export const BattleRevealedPieces = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    const snapshot = battleStory('revealed');
    const battle = snapshot.battle!;
    const card = snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose')!;
    card.battleOverlay = battle.id;
    card.items[0].artwork = {
      front: imageHref('/play-fixtures/dreamrules/snooper.jpg'),
      back: cardBack(),
      name: 'Snooper',
      type: 'card-treachery',
    };
    battle.revealed![0].pieces = [card];
    battle.revealed![0].cardIds = [card.id];
    playingSession.transport = hostedStoryTransport('seat-2', snapshot);
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    await waitFor(
      () => {
        const callout = canvasElement.ownerDocument.querySelector<HTMLElement>('[data-battle-stage="revealed"]');
        expect(callout).not.toBeNull();
        const card = within(callout!).getByRole('button', { name: 'Drag Snooper onto table' });
        expect(card).toBeVisible();
        expect(card).toBeEnabled();
      },
      { timeout: 30_000 }
    );
  },
});

export const BattleNumericDraft = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('seat-2', battleStory('preparing'));
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    const adjustment = page.getByRole('textbox', { name: 'Adjustment' });
    await userEvent.clear(adjustment);
    await userEvent.type(adjustment, '-0.25');
    expect(playingSession.transport.messages.filter((message) => message.type === 'command')).toHaveLength(0);
    await userEvent.keyboard('{Enter}');
    const saved = [...playingSession.transport.messages].reverse().find((message) => message.type === 'command');
    expect(saved?.action).toMatchObject({ kind: 'battle-plan', plan: { adjustment: -0.25 } });
    const troops = page.getByRole('textbox', { name: 'Harkonnen Troop' });
    await userEvent.clear(troops);
    await userEvent.type(troops, '12');
    await userEvent.keyboard('{Enter}');
    expect(playingSession.transport.messages.filter((message) => message.type === 'command')).toHaveLength(1);
    const snapshot = battleStory('preparing');
    snapshot.revision = 1;
    snapshot.battlePlan!.adjustment = -0.25;
    playingSession.transport.deliver(playingSession.transport.view(snapshot, saved!.commandId));
    await settled(() =>
      expect(playingSession.transport.messages.filter((message) => message.type === 'command')).toHaveLength(2)
    );
    const next = [...playingSession.transport.messages].reverse().find((message) => message.type === 'command');
    expect(next?.action).toMatchObject({
      kind: 'battle-plan',
      plan: { adjustment: -0.25, troops: [{ faceId: 'house-harkonnen-front', undialed: 12, dialed: 0 }] },
    });
  },
});

export const BattleResolved = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    const snapshot = battleStory('revealed');
    const battle = snapshot.battle!;
    const card = snapshot.table.pieces.find((piece) => piece.kind === 'card' && piece.items.length === 1)!;
    const plans = battle.revealed!;
    plans[0].pieces = [card];
    plans[0].cardIds = [card.id];
    snapshot.battleResults = [
      {
        id: battle.id,
        anchor: battle.anchor,
        territory: battle.territory,
        factions: ['house-harkonnen', 'house-atreides'],
        plans,
        outcome: 'left',
        revision: 1,
      },
    ];
    snapshot.battle = null;
    snapshot.battlePlan = null;
    snapshot.hand = [card];
    snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece.id !== card.id);
    snapshot.revision = 1;
    playingSession.transport = hostedStoryTransport('seat-2', snapshot);
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() =>
      expect(page.getByText('Arrakeen: house-harkonnen against house-atreides. Left side won.')).toBeInTheDocument()
    );
    expect(page.getByRole('button', { name: 'Drag Snooper from hand' })).toBeEnabled();
    expect(page.queryByRole('button', { name: 'No winner' })).toBeNull();
  },
});
