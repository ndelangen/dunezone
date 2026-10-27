import type { TablePanel } from '../GameTable';
import {
  ALLIANCES_GUIDANCE,
  AUDIT_LOG_GUIDANCE,
  GAME_LENGTH_GUIDANCE,
  GAME_LOG_GUIDANCE,
  REPLAY_GUIDANCE,
  SPICE_GUIDANCE,
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
  transfers: {
    key: 'transfers',
    label: 'Spice transfers',
    topic: 'spice',
    description: 'Public spice transfers, newest first.',
  },
  replay: { key: 'replay', label: 'Replay', topic: 'turn', ...REPLAY_GUIDANCE },
  spice: { key: 'spice', label: 'Spice', topic: 'spice', ...SPICE_GUIDANCE },
} as const satisfies Record<string, PanelWindow>;
