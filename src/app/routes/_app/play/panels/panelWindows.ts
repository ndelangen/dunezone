import type { TablePanel } from '../GameTable';
import {
  ALLIANCES_GUIDANCE,
  BATTLE_PLAN_GUIDANCE,
  FACTION_INFO_GUIDANCE,
  AUDIT_LOG_GUIDANCE,
  GAME_LENGTH_GUIDANCE,
  GAME_LOG_GUIDANCE,
  HAND_GUIDANCE,
  HIDDEN_ZONE_GUIDANCE,
  PLAYER_CONVERSATION_GUIDANCE,
  REPLAY_GUIDANCE,
  RESULT_GUIDANCE,
  SHARED_INVENTORY_GUIDANCE,
  SPICE_GUIDANCE,
  TABLE_CONVERSATION_GUIDANCE,
  TINTS_GUIDANCE,
} from '../multiplayer/panelGuidance';

/** What a window says about itself, apart from its content: its key, name, glyph and guidance. */
export type PanelWindow = Omit<TablePanel, 'content' | 'panels' | 'actions'>;

/*
 * Each panel's window, once: the table installs it from here, and its stories frame the panel in the same window.
 * A window whose guidance depends on the table (Setup, Battle plan) adds that where it installs the panel.
 */
export const PANEL_WINDOWS = {
  alliances: { key: 'alliances', label: 'Alliances', topic: 'alliance', ...ALLIANCES_GUIDANCE },
  tints: { key: 'tints', label: 'Territory tints', topic: 'tints', ...TINTS_GUIDANCE },
  settings: { key: 'settings', label: 'Settings', topic: 'controls', ...GAME_LENGTH_GUIDANCE },
  gameLog: { key: 'game-log', label: 'Game log', topic: 'game', ...GAME_LOG_GUIDANCE },
  audit: { key: 'audit', label: 'Audit', topic: 'audit', ...AUDIT_LOG_GUIDANCE },
  battlePlan: { key: 'battle', label: 'Battle plan', topic: 'battle', ...BATTLE_PLAN_GUIDANCE },
  battles: {
    key: 'battles',
    label: 'Battles',
    topic: 'battle',
    description: 'Agreed battle results and revealed plans.',
  },
  transfers: {
    key: 'transfers',
    label: 'Spice transfers',
    topic: 'spice',
    description: 'Public spice transfers, newest first.',
  },
  result: { key: 'result', label: 'Result', topic: 'result', ...RESULT_GUIDANCE },
  replay: { key: 'replay', label: 'Replay', topic: 'turn', ...REPLAY_GUIDANCE },
  review: {
    key: 'review',
    label: 'Table review',
    topic: 'turn',
    description:
      'Ask the table to look back at a recent checkpoint together. It starts when a majority of the players agree; everyone sees the same board and nothing can be moved or peeked at until play resumes.',
  },
  inventory: { key: 'shared', label: 'Shared table inventory', topic: 'assets', ...SHARED_INVENTORY_GUIDANCE },
  hand: { key: 'hand', label: 'Hand', topic: 'hand', ...HAND_GUIDANCE },
  sideTable: { key: 'hidden-zone', label: 'Private side-table', topic: 'hiddenZone', ...HIDDEN_ZONE_GUIDANCE },
  spice: { key: 'spice', label: 'Spice', topic: 'spice', ...SPICE_GUIDANCE },
  tableChat: { key: 'table-chat', label: 'Table chat', topic: 'planet', ...TABLE_CONVERSATION_GUIDANCE },
  /* A chat with a player takes that player's name and seat; this is what every one of them shares. */
  playerChat: { key: 'player', label: 'Player', topic: 'factions', ...PLAYER_CONVERSATION_GUIDANCE },
  factionInfo: { key: 'faction-info', label: 'Faction info', topic: 'factions', ...FACTION_INFO_GUIDANCE },
} as const satisfies Record<string, PanelWindow>;
