import type { TablePanel } from '../GameTable';
import { ALLIANCES_GUIDANCE, AUDIT_LOG_GUIDANCE, GAME_LOG_GUIDANCE } from '../multiplayer/panelGuidance';

/** What a window says about itself, apart from its content: its key, name, glyph and guidance. */
export type PanelWindow = Omit<TablePanel, 'content' | 'panels' | 'actions'>;

/*
 * Each panel's window, once: the table installs it from here, and its stories frame the panel in the same window.
 * A window whose guidance depends on the table (Setup, Battle plan) adds that where it installs the panel.
 */
export const PANEL_WINDOWS = {
  alliances: { key: 'alliances', label: 'Alliances', topic: 'alliance', ...ALLIANCES_GUIDANCE },
  tints: {
    key: 'tints',
    label: 'Territory tints',
    topic: 'tints',
    description: 'Colour territories for everyone to see.',
  },
  gameLog: { key: 'game-log', label: 'Game log', topic: 'game', ...GAME_LOG_GUIDANCE },
  audit: { key: 'audit', label: 'Audit', topic: 'audit', ...AUDIT_LOG_GUIDANCE },
} as const satisfies Record<string, PanelWindow>;
