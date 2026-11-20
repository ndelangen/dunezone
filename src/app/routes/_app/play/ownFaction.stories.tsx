import preview from '@sb/preview';

import { gameMeta } from './game.stories.fixture';
import { beforeTheDeal, dealFactions, withCue } from './ownFaction.stories.fixture';

/*
 * PROTOTYPE (#2987): how a player learns which faction they are once factions are dealt.
 * Each story opens on the drafting table; two seconds later the deal lands and Trading begins, showing one way of telling.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Own faction at start',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
  beforeEach: beforeTheDeal,
  globals: { motion: 'on' },
});

/** Today: nothing says which faction is yours. */
export const Today = meta.story({
  decorators: [withCue('none')],
  play: async ({ canvasElement }) => dealFactions(canvasElement),
});

/** A short centred reveal: "You are playing" over your token and faction name. Click or a few seconds dismisses it. */
export const Reveal = meta.story({
  decorators: [withCue('reveal')],
  play: async ({ canvasElement }) => dealFactions(canvasElement),
});

/** A "You" tag floats over your own seat on the table, for the whole game. */
export const TableTag = meta.story({
  decorators: [withCue('table-tag')],
  play: async ({ canvasElement }) => dealFactions(canvasElement),
});

/** A chip beside the phase in the header: your token, "You" and your faction, for the whole game. */
export const HeaderChip = meta.story({
  decorators: [withCue('header')],
  play: async ({ canvasElement }) => dealFactions(canvasElement),
});

/** Your token joins the bottom bar from the deal on (today it only comes with a hand), pulsing as it arrives; it opens Faction info. */
export const DockToken = meta.story({
  decorators: [withCue('dock')],
  play: async ({ canvasElement }) => dealFactions(canvasElement),
});

/** A soft notification under the header, like the turn toasts: "You are playing …". Clicking it opens Faction info on you. */
export const Toast = meta.story({
  decorators: [withCue('toast')],
  play: async ({ canvasElement }) => dealFactions(canvasElement),
});

/** The Faction info panel opens by itself on your own faction. */
export const FactionInfoOpens = meta.story({
  decorators: [withCue('faction-info')],
  play: async ({ canvasElement }) => dealFactions(canvasElement),
});
