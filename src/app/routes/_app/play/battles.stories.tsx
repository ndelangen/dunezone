import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import type { GameSnapshot } from '@shared/play/protocol';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { resolveRulebookBoardDefinition } from '@shared/rulebooks/boardDefinitions';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { battleStory, expectBattleCalloutPlacement, mapViewPoint, openTab, settled } from './playing.stories.fixture';
import { productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Playing/Battles',
});

function battleSetup(
  stage: Parameters<typeof battleStory>[0],
  viewer = 'seat-2',
  change?: (snapshot: GameSnapshot) => void
) {
  return install(() => {
    const snapshot = battleStory(stage);
    change?.(snapshot);
    return productTransport(viewer, snapshot);
  });
}

export const BattleCalloutBelowNorthernTerritory = meta.story({
  beforeEach: battleSetup('preparing', 'neutral', (snapshot) => {
    snapshot.battle!.anchor = [3.6, 0.18, -3.05];
  }),
  play: async ({ canvasElement }) => expectBattleCalloutPlacement(canvasElement, [3.6, 0.18, -3.05], 'below'),
});

export const BattleCalloutAboveSouthernTerritory = meta.story({
  beforeEach: battleSetup('preparing', 'neutral', (snapshot) => {
    snapshot.battle!.anchor = [3.6, 0.18, 3.05];
  }),
  play: async ({ canvasElement }) => expectBattleCalloutPlacement(canvasElement, [3.6, 0.18, 3.05], 'above'),
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

/** A battle marked mid-game draws its callout beside the territory on its first frame, since a table that draws on demand may not draw another. */
export const BattleCalloutArrivesInPlace = meta.story({
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
      expect(Math.abs(first.x - (sceneBounds.left + sceneBounds.width / 2))).toBeLessThanOrEqual(1);
      await expectBattleCalloutPlacement(canvasElement, marked.battle!.anchor, 'below');
      const settledDraw = callout.getBoundingClientRect();
      expect([Math.round(first.x), Math.round(first.y)]).toEqual([
        Math.round(settledDraw.x),
        Math.round(settledDraw.y),
      ]);
    } finally {
      stop();
    }
  },
});

/** The marker names the territory it lands on from the board's own outlines, so a battle dropped on Carthag is fought at Carthag. */
export const BattleMarkerNamesItsTerritory = meta.story({
  beforeEach: battleSetup('preparing', 'seat-2', (snapshot) => {
    snapshot.battle = null;
    snapshot.battlePlan = null;
  }),
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    await settled(() => expect(page.getByRole('button', { name: 'Drag battle marker onto territory' })).toBeVisible());
    const carthag = resolveRulebookBoardDefinition('arrakis')!.geometry.parts.find((part) => part.key === 'carthag')!;
    const [clientX, clientY] = mapViewPoint(document, [
      (carthag.x + carthag.width / 2 - 0.5) * BOARD_RADIUS * 2,
      0.18,
      (carthag.y + carthag.height / 2 - 0.5) * BOARD_RADIUS * 2,
    ]);
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('application/dune-battle', 'marker');
    /* The camera can still be settling on a cold worker, so the drop repeats until it lands. */
    await settled(() => {
      document
        .querySelector('canvas')!
        .dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX, clientY, dataTransfer }));
      expect(lastCommand()?.action).toMatchObject({ kind: 'battle-start', territory: 'Carthag' });
    });
  },
});

export const BattleUnclaimed = meta.story({
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
    expect(bounds.width).toBe(bounds.height);
    expect(getComputedStyle(claim).borderRadius).toBe('50%');
    await userEvent.click(claim);
    expect(lastCommand()?.action).toEqual({
      kind: 'battle-claim',
      battleId: 'story-battle',
      side: 0,
    });
  },
});

export const BattleOneClaimed = meta.story({
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
    expect(faction).toBeVisible();
    expect(faction.textContent).toBe('');
    const cancel = page.getByRole('button', { name: 'Cancel battle' });
    const shape = getComputedStyle(cancel);
    expect(parseFloat(shape.borderBottomLeftRadius)).toBeGreaterThan(parseFloat(shape.borderTopLeftRadius));
    expect(shape.borderBottomLeftRadius).toBe(shape.borderBottomRightRadius);
    await userEvent.click(cancel);
    expect(lastCommand()?.action).toEqual({
      kind: 'battle-cancel',
      battleId: 'story-battle',
    });
  },
});

/**
 * Every element in the wheels whose computed animation name is set.
 * The name stays after the reveal has finished, where `getAnimations` would come back empty, so a still wheel cannot pass for one that turned in before the check ran.
 */
function animatedIn(wheels: readonly HTMLElement[]) {
  return wheels
    .flatMap((wheel) => [wheel, ...wheel.querySelectorAll('*')])
    .filter((element) => getComputedStyle(element).animationName !== 'none');
}

const readiness = install(() => productTransport('neutral', battleStory('preparing', true)));

export const BattleReadiness = meta.story({
  beforeEach: readiness,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() =>
      expect(page.getByRole('img', { name: 'House Harkonnen, left side, aggressor, Preparing' })).toBeVisible()
    );
    const preparing = page.getByRole('img', { name: 'House Harkonnen, left side, aggressor, Preparing' });
    const ready = page.getByRole('img', { name: 'House Atreides, right side, Ready' });
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

/** The site's Motion setting reaches the wheels: the preparing side's ring holds still and dashed instead of pulsing. */
export const BattleReadinessStill = meta.story({
  globals: { motion: 'reduce' },
  beforeEach: readiness,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const preparing = await page.findByRole(
      'img',
      { name: 'House Harkonnen, left side, aggressor, Preparing' },
      { timeout: 30_000 }
    );
    const ready = page.getByRole('img', { name: 'House Atreides, right side, Ready' });
    expect(animatedIn([preparing, ready])).toEqual([]);
    expect(getComputedStyle(preparing.querySelector('svg[data-ready]')!).strokeDasharray).not.toBe('none');
  },
});

export const BattlePlanner = meta.story({
  beforeEach: install(() => {
    const snapshot = battleStory('preparing');
    const card = snapshot.table.pieces.find((piece) => piece.kind === 'card' && piece.items.length === 1)!;
    snapshot.hand!.push(card);
    snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece.id !== card.id);
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() => expect(page.getByRole('button', { name: 'Ready for battle' })).toBeEnabled());
    await settled(() => {
      expect(page.getByRole('textbox', { name: 'Troops' })).toBeEnabled();
      expect(page.queryByText(/harkonnen reverse/i)).toBeNull();
      expect(page.queryByRole('region', { name: 'Battle results' })).toBeNull();
    });

    const wheel = await page.findByLabelText(
      'House Harkonnen plan, troop strength 0, 0 spice',
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
    const saved = lastCommand();
    expect(saved?.action).toMatchObject({
      kind: 'battle-plan',
      plan: { cardIds: ['treachery-card-loose'] },
    });
    const currentWheel = page.getByLabelText(/^House Harkonnen plan,/);
    expect(within(currentWheel).getByRole('img', { name: 'Snooper' })).toBeInTheDocument();
  },
});

/** The plan's artwork arrives through `PublishedImage`, and a publication that fails to load draws its missing state. */
export const BattlePlanArtwork = meta.story({
  beforeEach: battleSetup('preparing', 'seat-2', (snapshot) => {
    const named = (name: string) => snapshot.hand!.find((piece) => piece.items[0]?.artwork?.name === name)!;
    named('Duncan Idaho').items[0]!.artwork!.front = new URL(
      '/play-fixtures/product/unpublished-traitor.jpg',
      location.origin
    ).href;
    snapshot.battlePlan!.leaderId = named('Feyd Rautha').id;
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    const arrived = (image: HTMLElement) =>
      expect(image.closest('[data-phase]')).toHaveAttribute('data-phase', 'shown');
    await settled(() => {
      const hand = page.getByLabelText('Cards from your hand');
      expect(within(hand).getByRole('img', { name: 'Duncan Idaho: preview unavailable' })).toBeVisible();
      for (const name of ['Thufir Hawat', 'Gurney Halleck', 'Doctor Yueh']) {
        arrived(within(hand).getByRole('img', { name }));
      }
      arrived(within(page.getByLabelText(/^House Harkonnen plan,/)).getByRole('img', { name: 'Feyd Rautha' }));
    });
  },
});

export const BattleReady = meta.story({
  beforeEach: battleSetup('preparing'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() => expect(page.getByRole('button', { name: 'Ready for battle' })).toBeEnabled());
    await userEvent.click(page.getByRole('button', { name: 'Ready for battle' }));
    expect(lastCommand()?.action).toEqual({
      kind: 'battle-ready',
      battleId: 'story-battle',
      ready: true,
    });
  },
});

async function expectPlanBound(
  canvasElement: HTMLElement,
  field: 'Committed spice' | 'Dialed',
  plan: Partial<NonNullable<GameSnapshot['battlePlan']>>
) {
  const page = within(canvasElement.ownerDocument.body);
  await openTab(page, 'Battle');
  await settled(async () => {
    const input = page.getByRole('textbox', { name: field });
    await userEvent.clear(input);
    await userEvent.type(input, '9');
    await userEvent.keyboard('{Enter}');
    expect(lastCommand()?.action).toMatchObject({ kind: 'battle-plan', plan });
  });
  return page;
}

export const BattleSpiceBound = meta.story({
  beforeEach: battleSetup('preparing', 'seat-2', (snapshot) => {
    snapshot.bank!.balance = 2;
  }),
  play: async ({ canvasElement }) => {
    const page = await expectPlanBound(canvasElement, 'Committed spice', { spice: 2 });
    await settled(() => expect(page.getByText(/0 available in your spice reserve, 2 reserved/)).toBeVisible());
  },
});

export const BattleCustomSpiceBound = meta.story({
  beforeEach: battleSetup('preparing', 'seat-2', (snapshot) => {
    snapshot.bank!.balance = 2;
    snapshot.battlePlan!.mode = 'custom';
  }),
  play: async ({ canvasElement }) => {
    await expectPlanBound(canvasElement, 'Dialed', {
      troops: [{ faceId: 'house-harkonnen-front', undialed: 0, dialed: 2 }],
    });
  },
});

export const BattleCountdown = meta.story({
  beforeEach: battleSetup('countdown'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() => expect(page.getByRole('button', { name: 'Undo Ready' })).toBeEnabled());
    expect(page.getByRole('textbox', { name: 'Committed spice' })).toBeDisabled();
    expect(page.queryByRole('button', { name: 'Cancel battle' })).toBeNull();
  },
});

export const BattleObserver = meta.story({
  beforeEach: install(() => productTransport('neutral', battleStory('revealed', true))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() => expect(page.getByRole('button', { name: 'No winner' })).toBeDisabled());
    expect(page.queryByRole('textbox', { name: 'Committed spice' })).toBeNull();
    expect(page.queryByRole('region', { name: 'Your hand and leaders' })).toBeNull();
  },
});

const revealedPieces = install(() => {
  const snapshot = battleStory('revealed');
  const battle = snapshot.battle!;
  const card = snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose')!;
  card.battleOverlay = battle.id;
  battle.revealed![0].pieces = [card];
  battle.revealed![0].cardIds = [card.id];
  return productTransport('seat-2', snapshot);
});

export const BattleRevealedPieces = meta.story({
  beforeEach: revealedPieces,
  play: async ({ canvasElement }) => {
    await waitFor(
      () => {
        const callout = canvasElement.ownerDocument.querySelector<HTMLElement>('[data-battle-stage="revealed"]');
        expect(callout).not.toBeNull();
        const card = within(callout!).getByRole('button', { name: 'Drag Snooper onto table' });
        expect(finishTransitions(card)).toBeVisible();
        expect(card).toBeEnabled();
      },
      { timeout: 30_000 }
    );
  },
});

/** The site's Motion setting reaches the wheels: both plans show at once, with no turn. */
export const BattleRevealedPiecesStill = meta.story({
  globals: { motion: 'reduce' },
  beforeEach: revealedPieces,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const plans = /^House (Harkonnen|Atreides) plan,/;
    /* The viewer is a side, so the dock opens on the Battle tab with its own plan's wheel; the two on the table are the reveal. */
    const revealed = () => page.getAllByLabelText(plans).filter((plan) => !plan.closest('.seated-controls-panel'));
    await settled(() => expect(revealed()).toHaveLength(2));
    expect(animatedIn(page.getAllByLabelText(plans))).toEqual([]);
    for (const plan of revealed()) {
      expect(within(plan).getByText('Force')).toBeVisible();
    }
  },
});

export const BattleNumericDraft = meta.story({
  beforeEach: battleSetup('preparing'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    const adjustment = page.getByRole('textbox', { name: 'Adjustment' });
    await userEvent.clear(adjustment);
    await userEvent.type(adjustment, '-0.25');
    expect(session.transport.messages.filter((message) => message.type === 'command')).toHaveLength(0);
    await userEvent.keyboard('{Enter}');
    const saved = lastCommand();
    expect(saved?.action).toMatchObject({ kind: 'battle-plan', plan: { adjustment: -0.25 } });
    const troops = page.getByRole('textbox', { name: 'Troops' });
    await userEvent.clear(troops);
    await userEvent.type(troops, '12');
    await userEvent.keyboard('{Enter}');
    expect(session.transport.messages.filter((message) => message.type === 'command')).toHaveLength(1);
    const snapshot = battleStory('preparing');
    snapshot.revision = 1;
    snapshot.battlePlan!.adjustment = -0.25;
    session.transport.deliver(session.transport.view(snapshot, saved!.commandId));
    await settled(() =>
      expect(session.transport.messages.filter((message) => message.type === 'command')).toHaveLength(2)
    );
    const next = lastCommand();
    expect(next?.action).toMatchObject({
      kind: 'battle-plan',
      plan: { adjustment: -0.25, troops: [{ faceId: 'house-harkonnen-front', undialed: 12, dialed: 0 }] },
    });
  },
});

/* A real game keys each faction by its Convex document id, so a label that prints the id instead of the roster's name only shows once the stories stop using slugs. */
const convexIds: Record<string, string> = {
  'house-harkonnen': 'k175em553h9x2vq0t8c4wj6rsd7ab1ny',
  'house-atreides': 'k17fybprv2m8kq5z3x0hd9tnwc6js4ge',
};
function withConvexIds(snapshot: GameSnapshot): GameSnapshot {
  return JSON.parse(
    Object.entries(convexIds).reduce(
      (json, [slug, id]) => json.replaceAll(`"${slug}"`, `"${id}"`),
      JSON.stringify(snapshot)
    )
  );
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
    snapshot.hand!.push(card);
    snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece.id !== card.id);
    snapshot.revision = 1;
    return productTransport('seat-2', rekey(snapshot));
  });
}

export const BattleResolved = meta.story({
  beforeEach: resolvedBattle(),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() =>
      expect(page.getByText('Arrakeen: House Harkonnen against House Atreides. Left side won.')).toBeInTheDocument()
    );
    expect(page.getByRole('button', { name: 'Drag Snooper from hand' })).toBeEnabled();
    expect(page.queryByRole('button', { name: 'No winner' })).toBeNull();
  },
});

/** A real game's result names both factions from the roster, never by the Convex ids the result carries. */
export const BattleResolvedInRealGame = meta.story({
  beforeEach: resolvedBattle(withConvexIds),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() =>
      expect(page.getByText('Arrakeen: House Harkonnen against House Atreides. Left side won.')).toBeInTheDocument()
    );
    expect(page.getByLabelText(/^House Harkonnen plan, troop strength/)).toBeInTheDocument();
    expect(page.getByLabelText(/^House Atreides plan, troop strength/)).toBeInTheDocument();
    for (const id of Object.values(convexIds)) {
      expect(page.queryByText(new RegExp(id))).toBeNull();
      expect(page.queryByLabelText(new RegExp(id))).toBeNull();
    }
  },
});

/** A live battle's wheels name both sides from the roster in a real game too. */
export const BattleReadinessInRealGame = meta.story({
  beforeEach: install(() => productTransport('neutral', withConvexIds(battleStory('preparing', true)))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() =>
      expect(page.getByRole('img', { name: 'House Harkonnen, left side, aggressor, Preparing' })).toBeVisible()
    );
    expect(page.getByRole('img', { name: 'House Atreides, right side, Ready' })).toBeVisible();
  },
});
