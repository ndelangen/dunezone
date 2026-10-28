import { testingPreview } from '@sb/preview';
import { waitForFrame, finishTransitions } from '@sb/storyWaits';
import type { GameSnapshot } from '@shared/play/protocol';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { resolveRulebookBoardDefinition } from '@shared/rulebooks/boardDefinitions';
import { expect, userEvent, within, waitFor } from 'storybook/test';

import { dragBattleMarker } from './battles.marker.stories.fixture';
import { battleSetup, readiness, convexIds, withConvexIds, revealedPieces } from './battles.stories.fixture';
import { expectNoControl, openPanel, unpinWindow, WAIT, windowNamed } from './controls.stories.fixture';
import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { battleStory, expectBattleCalloutPlacement, openTab, settled } from './playing.stories.fixture';
import { productTransport } from './product.stories.fixture';
import { dragOnto } from './sortable.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Battles',
});

/* Each element's box at its first style write, since any later frame would move a callout before an assertion could see where it was first drawn. */
function recordFirstDraws(document: Document) {
  const firstDraws = new Map<Element, DOMRect>();
  const observer = new MutationObserver((records) => {
    for (const { target } of records) {
      if (target instanceof Element && !firstDraws.has(target)) {
        firstDraws.set(target, target.getBoundingClientRect());
      }
    }
  });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
  return { firstDraws, stop: () => observer.disconnect() };
}

async function expectPlanBound(
  canvasElement: HTMLElement,
  field: 'Spice' | 'Troops spiced',
  plan: Partial<NonNullable<GameSnapshot['battlePlan']>>
) {
  const page = within(canvasElement.ownerDocument.body);
  await openTab(page, 'Battle plan');
  await settled(async () => {
    const input = page.getByRole('textbox', { name: field });
    await userEvent.clear(input);
    await userEvent.type(input, '9');
    await userEvent.keyboard('{Enter}');
    await expect(lastCommand()?.action).toMatchObject({ kind: 'battle-plan', plan });
  });
  return page;
}

function resolvedBattle(rekey: (snapshot: GameSnapshot) => GameSnapshot = (snapshot) => snapshot) {
  return install(() => {
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
    /* Resolving leaves the revealed card on the table, where its owner discards it by hand. */
    snapshot.revision = 1;
    return productTransport('seat-2', rekey(snapshot));
  });
}

/** A seated snapshot in play with a loose Treachery card moved into the viewer's hand, as Play/Panels/Hand shows it. */
function withCardInHand(snapshot: GameSnapshot) {
  const card = snapshot.table.pieces.find((piece) => piece.kind === 'card' && piece.items.length === 1);
  if (!card || !snapshot.hand) {
    throw new Error('withCardInHand needs a seated snapshot with a loose Treachery card on the table.');
  }
  snapshot.hand.push({ ...card, owner: snapshot.bank?.factionId ?? card.owner });
  snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece.id !== card.id);
  return snapshot;
}

/** A leader disc from the story's published fronts, as a plan or a reveal carries it. */
function storyLeader(id: string, image: string, name: string) {
  const front = new URL(`/play-fixtures/product/${image}.jpg`, location.origin).href;
  return {
    id,
    label: name,
    owner: 'shared' as const,
    color: '#3f2523',
    accent: '#d99b57',
    kind: 'force' as const,
    stackKey: null,
    position: [0, 0.14, 0] as [number, number, number],
    orientation: 0,
    zoneId: null,
    locked: false,
    items: [{ id: `${id}-item`, faceUp: true, artwork: { front, back: front, name, type: 'token-disc' } }],
  };
}

/**
 * Battle, a part of each plan shown before the reveal: Harkonnen showed its card and its dial, Atreides its leader and a card.
 * Each side's revealed parts show on its battle wheel for everyone, and the plan editor keeps them fixed while shown.
 */
function earlyRevealSnapshot() {
  const snapshot = withCardInHand(battleStory('preparing'));
  const card = snapshot.hand!.pop()!;
  const leader = storyLeader('harkonnen-leader', 'house-harkonnen-1423d459-65bd-4f38-8859-52f69a5b3e2b', 'Feyd-Rautha');
  const plan = snapshot.battlePlan!;
  const faceId = plan.faces[0]!.id;
  Object.assign(plan, {
    troops: [{ faceId, undialed: 3, dialed: 2 }],
    spice: 2,
    strength: 3.5,
    leaderIds: [leader.id],
    cardIds: [card.id],
    pieces: [leader, card],
    disclosed: { leader: false, dial: true, cardIds: [card.id] },
  });
  const atreidesCard = { ...card, id: 'atreides-disclosed-card' };
  snapshot.battle!.disclosed = [
    {
      cards: [{ ...card, id: 'harkonnen-disclosed-card' }],
      dial: { strength: 3.5 },
    },
    {
      leaders: [storyLeader('atreides-leader', 'house-atreides-01f1cf94-2df1-4b96-9fbf-dd757afef27b', 'Duncan Idaho')],
      cards: [atreidesCard],
    },
  ];
  snapshot.bank!.balance = 8;
  return snapshot;
}

export const CalloutBelowNorthernTerritory = meta.story({
  beforeEach: battleSetup('preparing', 'neutral', (snapshot) => {
    snapshot.battle!.anchor = [3.6, 0.18, -3.05];
  }),
  play: async ({ canvasElement }) => expectBattleCalloutPlacement(canvasElement, [3.6, 0.18, -3.05], 'below'),
});

export const CalloutAboveSouthernTerritory = meta.story({
  beforeEach: battleSetup('preparing', 'neutral', (snapshot) => {
    snapshot.battle!.anchor = [3.6, 0.18, 3.05];
  }),
  play: async ({ canvasElement }) => expectBattleCalloutPlacement(canvasElement, [3.6, 0.18, 3.05], 'above'),
});

/** A battle marked mid-game draws its callout beside the territory on its first frame, since a table that draws on demand may not draw another. */
export const CalloutArrivesInPlace = meta.story({
  globals: { motion: 'on' },
  beforeEach: battleSetup('preparing', 'seat-2', (snapshot) => {
    snapshot.battle = null;
    snapshot.battlePlan = null;
  }),
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    await settled(() => expect(page.getByRole('button', { name: 'Drag battle marker onto territory' })).toBeVisible());
    const { firstDraws, stop } = recordFirstDraws(document);
    try {
      const marked = battleStory('preparing');
      marked.battle!.sides = [null, null];
      marked.battlePlan = null;
      marked.revision = 1;
      session.transport.deliver(session.transport.view(marked));
      const cancel = await page.findByRole('button', { name: 'Cancel battle' }, { timeout: 30_000 });
      const scene = document.querySelector('canvas')!;
      /* drei's Html writes the drawn position on a zero-size wrapper beside the canvas, so that wrapper's first style write is where the callout was first drawn. */
      let callout: Element = cancel;
      while (callout.parentElement && !callout.parentElement.contains(scene)) {
        callout = callout.parentElement;
      }
      /* That write happens only inside the scene's animation-frame callbacks, so each poll runs the waiting frames itself. */
      await waitForFrame(() => expect(firstDraws.has(callout)).toBe(true), { timeout: 30_000 });
      const first = firstDraws.get(callout)!;
      const sceneBounds = scene.getBoundingClientRect();
      await expect(Math.abs(first.x - (sceneBounds.left + sceneBounds.width / 2))).toBeLessThanOrEqual(1);
      await expectBattleCalloutPlacement(canvasElement, marked.battle!.anchor, 'below');
      const settledDraw = callout.getBoundingClientRect();
      await expect([Math.round(first.x), Math.round(first.y)]).toEqual([
        Math.round(settledDraw.x),
        Math.round(settledDraw.y),
      ]);
    } finally {
      stop();
    }
  },
});

/** The marker names the territory it lands on from the board's own outlines, so a battle dropped on Carthag is fought at Carthag. */
export const MarkerNamesItsTerritory = meta.story({
  beforeEach: battleSetup('preparing', 'seat-2', (snapshot) => {
    snapshot.battle = null;
    snapshot.battlePlan = null;
  }),
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const carthag = resolveRulebookBoardDefinition('arrakis')!.geometry.parts.find((part) => part.key === 'carthag')!;
    await dragBattleMarker(
      document,
      [
        (carthag.x + carthag.width / 2 - 0.5) * BOARD_RADIUS * 2,
        0.18,
        (carthag.y + carthag.height / 2 - 0.5) * BOARD_RADIUS * 2,
      ],
      async () => {
        await expect(lastCommand()?.action).toMatchObject({ kind: 'battle-start', territory: 'Carthag' });
      }
    );
  },
});

export const Unclaimed = meta.story({
  beforeEach: install(() => {
    const snapshot = battleStory('preparing');
    snapshot.battle!.sides = [null, null];
    snapshot.battlePlan = null;
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() => expect(page.getByRole('button', { name: 'Claim left side' })).toBeEnabled());
    const claim = page.getByRole('button', { name: 'Claim left side' });
    const bounds = claim.getBoundingClientRect();
    await expect(bounds.width).toBe(bounds.height);
    await expect(getComputedStyle(claim).borderRadius).toBe('50%');
    await userEvent.click(claim);
    await expect(lastCommand()?.action).toEqual({
      kind: 'battle-claim',
      battleId: 'story-battle',
      side: 0,
    });
  },
});

export const OneClaimed = meta.story({
  beforeEach: install(() => {
    const snapshot = battleStory('preparing');
    snapshot.battle!.sides = [null, { factionId: 'house-atreides', ready: false, choice: null }];
    snapshot.battlePlan = null;
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() => expect(page.getByRole('button', { name: 'Cancel battle' })).toBeEnabled());
    const faction = page.getByRole('img', { name: 'House Atreides, right side, Preparing' });
    await expect(faction).toBeVisible();
    await expect(faction.textContent).toBe('');
    const cancel = page.getByRole('button', { name: 'Cancel battle' });
    const shape = getComputedStyle(cancel);
    await expect(parseFloat(shape.borderBottomLeftRadius)).toBeGreaterThan(parseFloat(shape.borderTopLeftRadius));
    await expect(shape.borderBottomLeftRadius).toBe(shape.borderBottomRightRadius);
    await userEvent.click(cancel);
    await expect(lastCommand()?.action).toEqual({
      kind: 'battle-cancel',
      battleId: 'story-battle',
    });
  },
});

export const Readiness = meta.story({
  beforeEach: readiness,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() =>
      expect(page.getByRole('img', { name: 'House Harkonnen, left side, aggressor, Preparing' })).toBeVisible()
    );
    const preparing = page.getByRole('img', { name: 'House Harkonnen, left side, aggressor, Preparing' });
    const ready = page.getByRole('img', { name: 'House Atreides, right side, Ready' });
    await expect(ready).toBeVisible();
    const preparingRing = preparing.querySelector('svg[data-ready]')!;
    const readyRing = ready.querySelector('svg[data-ready]')!;
    await expect(preparingRing).toBeVisible();
    await expect(readyRing).toBeVisible();
    await expect(getComputedStyle(readyRing).stroke).not.toBe(getComputedStyle(preparingRing).stroke);
    await expect(getComputedStyle(readyRing).animationName).toBe('none');
    await expect(page.getByRole('button', { name: 'Cancel battle' })).toBeDisabled();
  },
});

/** Battle, planning: the troops, leader, cards and spice the plan commits, before Ready. */
export const Planning = meta.story({
  beforeEach: install(() => productTransport('seat-2', withCardInHand(battleStory('preparing')))),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Battle plan');
    await expect(page.findByRole('button', { name: 'Ready for battle' }, WAIT)).resolves.toBeVisible();
  },
});

export const Planner = meta.story({
  beforeEach: install(() => {
    const snapshot = battleStory('preparing');
    const card = snapshot.table.pieces.find((piece) => piece.kind === 'card' && piece.items.length === 1)!;
    snapshot.hand!.push(card);
    snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece.id !== card.id);
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle plan');
    await settled(() => expect(page.getByRole('button', { name: 'Ready for battle' })).toBeEnabled());
    await settled(async () => {
      await expect(page.getByRole('textbox', { name: 'Troops' })).toBeEnabled();
      await expect(page.queryByText(/harkonnen reverse/i)).toBeNull();
      await expect(page.queryByRole('region', { name: 'Battle results' })).toBeNull();
    });

    await expect(
      page.findByLabelText('Your plan: troop strength 0, 0 spice', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await settled(() => expect(page.getByRole('textbox', { name: 'Spice' })).toBeEnabled());

    const card = await page.findByRole('button', { name: 'Put Snooper into the plan' }, { timeout: 30_000 });
    await expect(card).toHaveAttribute('aria-pressed', 'false');
    await expect(within(card).getByRole('img', { name: 'Snooper' })).toBeInTheDocument();
    await userEvent.click(card);
    const saved = lastCommand();
    await expect(saved?.action).toMatchObject({
      kind: 'battle-plan',
      plan: { cardIds: ['treachery-card-loose'] },
    });
    const currentWheel = page.getByLabelText(/^Your plan:/);
    await expect(within(currentWheel).getByRole('img', { name: 'Snooper' })).toBeInTheDocument();
  },
});

/** The plan's artwork arrives through `PublishedImage`, and a publication that fails to load draws its missing state. */
export const PlanArtwork = meta.story({
  beforeEach: battleSetup('preparing', 'seat-2', (snapshot) => {
    const named = (name: string) => snapshot.hand!.find((piece) => piece.items[0]?.artwork?.name === name)!;
    named('Beast Rabban').items[0]!.artwork!.front = new URL(
      '/play-fixtures/product/unpublished-traitor.jpg',
      location.origin
    ).href;
    snapshot.battlePlan!.leaderIds = [named('Feyd Rautha').id];
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle plan');
    const arrived = (image: HTMLElement) =>
      expect(image.closest('[data-phase]')).toHaveAttribute('data-phase', 'shown');
    await settled(async () => {
      const leaders = page.getByRole('region', { name: 'Leader' });
      await expect(within(leaders).getByRole('img', { name: 'Beast Rabban: preview unavailable' })).toBeVisible();
      for (const name of ['Piter De Vries', 'Cpt. Iakin Nefud']) {
        await arrived(within(leaders).getByRole('img', { name }));
      }
      await arrived(within(page.getByLabelText(/^Your plan:/)).getByRole('img', { name: 'Feyd Rautha' }));
    });
  },
});

/**
 * Dragging a leader along its row moves it in the player's own order, which the room keeps for the Hand & spice window too;
 * the row shows the new order at once.
 */
export const ReorderLeaders = meta.story({
  beforeEach: battleSetup('preparing'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle plan');
    const leaders = () => within(page.getByRole('region', { name: 'Leader' }));
    const order = () =>
      leaders()
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'));
    const first = await leaders().findByRole('button', { name: 'Put Beast Rabban into the plan' }, WAIT);
    const moved = leaders().getByRole('button', { name: 'Put Piter De Vries into the plan' });
    await expect(order().indexOf('Put Piter De Vries into the plan')).toBeGreaterThan(
      order().indexOf('Put Beast Rabban into the plan')
    );
    await dragOnto(moved, first);
    await waitFor(() =>
      expect(lastCommand()?.action).toMatchObject({ kind: 'hand-order', before: expect.any(String) })
    );
    await expect(order().indexOf('Put Piter De Vries into the plan')).toBeLessThan(
      order().indexOf('Put Beast Rabban into the plan')
    );
  },
});

/** A participant sees their planner open once, then keeps the window they chose across battle updates. */
export const FocusOnce = meta.story({
  beforeEach: battleSetup('preparing'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() => expect(windowNamed(page, 'Battle plan')).toBeVisible());
    await unpinWindow(page, 'Battle plan');
    await openTab(page, 'Hand');
    const snapshot = battleStory('preparing');
    snapshot.revision = 1;
    session.transport.deliver(session.transport.view(snapshot));
    await settled(() => expect(windowNamed(page, 'Hand')).toBeVisible());
    await expect(windowNamed(page, 'Battle plan')).toBeNull();
  },
});

export const NumericDraft = meta.story({
  beforeEach: battleSetup('preparing'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle plan');
    await userEvent.click(await page.findByRole('button', { name: /^Adjust the strength by hand/ }, WAIT));
    const adjustment = await page.findByRole('textbox', { name: 'Adjustment' }, WAIT);
    await userEvent.clear(adjustment);
    await userEvent.type(adjustment, '-1.5');
    await expect(session.transport.messages.filter((message) => message.type === 'command')).toHaveLength(0);
    await userEvent.keyboard('{Enter}');
    const saved = lastCommand();
    await expect(saved?.action).toMatchObject({ kind: 'battle-plan', plan: { adjustment: -1.5 } });
    const troops = page.getByRole('textbox', { name: 'Troops' });
    await userEvent.clear(troops);
    await userEvent.type(troops, '5');
    await userEvent.keyboard('{Enter}');
    await expect(session.transport.messages.filter((message) => message.type === 'command')).toHaveLength(1);
    const snapshot = battleStory('preparing');
    snapshot.revision = 1;
    snapshot.battlePlan!.adjustment = -1.5;
    session.transport.deliver(session.transport.view(snapshot, saved!.commandId));
    await settled(() =>
      expect(session.transport.messages.filter((message) => message.type === 'command')).toHaveLength(2)
    );
    const next = lastCommand();
    await expect(next?.action).toMatchObject({
      kind: 'battle-plan',
      plan: { adjustment: -1.5, troops: [{ faceId: 'troop-0-front', undialed: 5, dialed: 0 }] },
    });
  },
});

export const SpiceBound = meta.story({
  beforeEach: battleSetup('preparing', 'seat-2', (snapshot) => {
    snapshot.bank!.balance = 2;
    /* Five troops could take five spice, so the reserve is what bounds it. */
    snapshot.battlePlan!.troops = [{ faceId: 'troop-0-front', undialed: 5, dialed: 0 }];
  }),
  play: async ({ canvasElement }) => {
    const page = await expectPlanBound(canvasElement, 'Spice', { spice: 2 });
    await settled(() => expect(page.getByRole('textbox', { name: 'Spice' })).toHaveValue('2'));
  },
});

export const CustomSpiceBound = meta.story({
  beforeEach: battleSetup('preparing', 'seat-2', (snapshot) => {
    snapshot.bank!.balance = 2;
    snapshot.battlePlan!.mode = 'custom';
  }),
  play: async ({ canvasElement }) => {
    await expectPlanBound(canvasElement, 'Troops spiced', {
      troops: [{ faceId: 'troop-0-front', undialed: 0, dialed: 2 }],
    });
  },
});

export const EarlyReveal = meta.story({
  beforeEach: install(() => productTransport('seat-2', earlyRevealSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Battle plan');
    await expect(page.findByRole('button', { name: 'Hide your dial again' }, WAIT)).resolves.toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(
      page.findByRole('button', { name: 'Show your leader to everyone now' }, WAIT)
    ).resolves.toHaveAttribute('aria-pressed', 'false');
    /* The parts fade in on the table, so the check is that they are drawn, not that the fade has finished. */
    await expect(
      page.findByRole('img', { name: /Harkonnen dial revealed early: 3\.5$/ }, WAIT)
    ).resolves.toBeInTheDocument();
    await expect(
      page.findByRole('group', { name: /Atreides leader revealed early$/ }, WAIT)
    ).resolves.toBeInTheDocument();
  },
});

export const Ready = meta.story({
  beforeEach: battleSetup('preparing'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle plan');
    await settled(() => expect(page.getByRole('button', { name: 'Ready for battle' })).toBeEnabled());
    await userEvent.click(page.getByRole('button', { name: 'Ready for battle' }));
    await expect(lastCommand()?.action).toEqual({
      kind: 'battle-ready',
      battleId: 'story-battle',
      ready: true,
    });
  },
});

export const Countdown = meta.story({
  beforeEach: battleSetup('countdown'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle plan');
    await settled(() => expect(page.getByRole('button', { name: 'Undo Ready' })).toBeEnabled());
    await expect(page.getByRole('textbox', { name: 'Spice' })).toBeDisabled();
    await expect(page.queryByRole('button', { name: 'Cancel battle' })).toBeNull();
  },
});

/** Battle, both plans revealed: the panel shows the viewer's plan locked, and the winner is called on the table's callout. */
export const Revealed = meta.story({
  beforeEach: install(() => productTransport('seat-2', battleStory('revealed'))),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Battle plan');
    await expect(page.findByRole('textbox', { name: 'Troops' }, WAIT)).resolves.toBeDisabled();
    await expect(page.queryByRole('button', { name: /Ready for battle|Undo Ready/ })).toBeNull();
    await expect(page.findByRole('button', { name: 'No winner' }, WAIT)).resolves.toBeVisible();
  },
});

export const Observer = meta.story({
  beforeEach: install(() => productTransport('neutral', battleStory('revealed', true))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle plan');
    await settled(() => expect(page.getByRole('button', { name: 'No winner' })).toBeDisabled());
    await expect(page.getByText('Both plans are revealed on the table.')).toBeVisible();
    await expect(page.queryByRole('textbox', { name: 'Spice' })).toBeNull();
    await expect(page.queryByRole('region', { name: 'Your hand and leaders' })).toBeNull();
  },
});

/** The other side's call is lit, so agreeing with it is one click. */
export const WinnerCalledByOpponent = meta.story({
  beforeEach: battleSetup('revealed', 'seat-2', (snapshot) => {
    snapshot.battle!.sides[0]!.choice = null;
    snapshot.battle!.sides[1]!.choice = 'left';
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() => expect(page.getByText('House Atreides says left side won')).toBeVisible());
    await userEvent.click(page.getByRole('button', { name: 'Left side won' }));
    await expect(lastCommand()?.action).toEqual({ kind: 'battle-outcome', battleId: 'story-battle', outcome: 'left' });
  },
});

/** After the reveal the battle ends as resolved, not cancelled, and it settles with whatever the sides called. */
export const RevealedResolve = meta.story({
  beforeEach: battleSetup('revealed', 'seat-2', (snapshot) => {
    for (const side of snapshot.battle!.sides) {
      side!.choice = null;
    }
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() => expect(page.getByRole('button', { name: 'Resolve battle' })).toBeEnabled());
    await expect(page.queryByRole('button', { name: 'Cancel battle' })).toBeNull();
    await expect(page.queryByText(/^Waiting for /)).toBeNull();
    await expect(page.queryByText(/ says /)).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Resolve battle' }));
    await expect(lastCommand()?.action).toEqual({ kind: 'battle-cancel', battleId: 'story-battle' });
  },
});

export const Resolved = meta.story({
  beforeEach: resolvedBattle(),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battles');
    await settled(() =>
      expect(page.getByText('Arrakeen: House Harkonnen against House Atreides. Left side won.')).toBeInTheDocument()
    );
    await settled(() =>
      expect(canvasElement.ownerDocument.querySelector('[data-piece-id="treachery-card-loose"]')).not.toBeNull()
    );
    await expect(page.queryByRole('button', { name: 'No winner' })).toBeNull();
    const snapshot = session.transport.snapshot;
    session.transport.deliver(
      session.transport.view({ ...snapshot, phase: snapshot.phase + 1, revision: snapshot.revision + 1 })
    );
    await settled(() => expect(windowNamed(page, 'Battles')).toBeVisible());
    await openTab(page, 'Phase');
    await expectNoControl(page, 'Battle plan');
    await openTab(page, 'Battles');
    await expect(page.getByText('Arrakeen: House Harkonnen against House Atreides. Left side won.')).toBeVisible();
  },
});

/** A real game's result names both factions from the roster, never by the Convex ids the result carries. */
export const ResolvedInRealGame = meta.story({
  beforeEach: resolvedBattle(withConvexIds),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battles');
    await settled(() =>
      expect(page.getByText('Arrakeen: House Harkonnen against House Atreides. Left side won.')).toBeInTheDocument()
    );
    await expect(page.getByLabelText(/^House Harkonnen plan, troop strength/)).toBeInTheDocument();
    await expect(page.getByLabelText(/^House Atreides plan, troop strength/)).toBeInTheDocument();
    for (const id of Object.values(convexIds)) {
      await expect(page.queryByText(new RegExp(id))).toBeNull();
      await expect(page.queryByLabelText(new RegExp(id))).toBeNull();
    }
  },
});

/** A live battle's wheels name both sides from the roster in a real game too. */
export const ReadinessInRealGame = meta.story({
  beforeEach: install(() => productTransport('neutral', withConvexIds(battleStory('preparing', true)))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() =>
      expect(page.getByRole('img', { name: 'House Harkonnen, left side, aggressor, Preparing' })).toBeVisible()
    );
    await expect(page.getByRole('img', { name: 'House Atreides, right side, Ready' })).toBeVisible();
  },
});

export const RevealedPieces = meta.story({
  beforeEach: revealedPieces,
  play: async ({ canvasElement }) => {
    await waitFor(
      async () => {
        const callout = canvasElement.ownerDocument.querySelector<HTMLElement>('[data-battle-stage="revealed"]');
        await expect(callout).not.toBeNull();
        const card = within(callout!).getByRole('button', { name: 'Drag Snooper onto table' });
        await expect(finishTransitions(card)).toBeVisible();
        await expect(card).toBeEnabled();
      },
      { timeout: 30_000 }
    );
  },
});
