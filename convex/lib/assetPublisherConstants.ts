export {
  CURRENT_FACTION_SHEET_RENDERER_VERSION,
  INITIAL_FACTION_SHEET_RENDERER_VERSION,
  isKnownFactionSheetRendererVersion,
  isSupportedFactionSheetRendererVersion,
  KNOWN_FACTION_SHEET_RENDERER_VERSIONS,
  type KnownFactionSheetRendererVersion,
  PREVIOUS_FACTION_SHEET_RENDERER_VERSION,
  SUPPORTED_FACTION_SHEET_RENDERER_VERSIONS,
  type SupportedFactionSheetRendererVersion,
} from '../../src/app/capture/faction-sheet-renderer-versions';

export const FACTION_SHEET_ASSET_TYPE = 'faction_sheet' as const;
export const MAX_PUBLISHER_ITEMS = 20;
export const ITEM_CLAIM_LEASE_MS = 8 * 60 * 1_000;
export const MAX_CONSECUTIVE_RENDER_FAILURES = 10;
export const FACTION_SHEET_TARGET_ACTIVATION_PREREQUISITE =
  'faction_sheet_targets_verify_v1' as const;
export const ITEM_CLAIM_MIGRATION_IDS = [
  'asset_targets_item_claims_v1',
  'asset_claim_snapshots_retire_v1',
  'asset_publisher_state_retire_v1',
  'asset_publisher_admission_counter_retire_v1',
  'asset_targets_item_claims_verify_v1',
] as const;
