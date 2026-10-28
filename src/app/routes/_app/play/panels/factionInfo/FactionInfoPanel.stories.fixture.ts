import type { GameSnapshot } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { fn } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { removalSnapshot } from '../../game.stories.fixture';
import { capturedFactions, factions, playingSnapshot } from '../../product.stories.fixture';
import { panelMeta, tableOf } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { FactionInfoPanel } from './FactionInfoPanel';
import type { FactionInfoPanelProps } from './FactionInfoPanel';
import { factionInfoProps } from './useFactionInfoPanel';

/** Where the window's actions go: the table's commands, which the panel's props and header model call with what they name. */
export const actions = { onBallot: fn(), onStartRemoval: fn(), onAlliance: fn() };

/**
 * The panel's props as the table hands them for one seat of this snapshot, seen from the viewer's seat, with spied actions.
 * The faction's captured sheet and page come from the story factions, as a real game reads them.
 */
export function factionInfoArgs(
  snapshot: GameSnapshot,
  seat = 'seat-1',
  viewer = 'seat-2',
  { captured = true } = {}
): FactionInfoPanelProps {
  const factionId = snapshot.roster!.seats.find((entry) => entry.id === seat)?.faction?.id;
  return factionInfoProps(tableOf(snapshot, viewer), seat, {
    error: null,
    details: captured && factionId ? capturedFactions()[factionId] : undefined,
    slug: factions.find((entry) => entry.slug === factionId)?.slug,
    now: STORYBOOK_NOW,
    requests: null,
    swapping: null,
    ...actions,
  })!;
}

/** The six-seat game mid-play, with seat 6's player gone and the seat open. */
export function vacantSnapshot() {
  const snapshot = playingSnapshot();
  snapshot.controls!.players = snapshot.controls!.players.filter((player) => player.seat !== 'seat-6');
  return snapshot;
}

export const observerArgs = () => factionInfoArgs(playingSnapshot(), 'seat-1', SPECTATOR_SEAT);
export { removalSnapshot };

export const factionInfoPanelMeta = {
  ...panelMeta(PANEL_WINDOWS.factionInfo),
  component: FactionInfoPanel,
  args: factionInfoArgs(playingSnapshot()),
};
