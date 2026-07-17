export const INITIAL_FACTION_SHEET_RENDERER_VERSION = 'faction-sheet-v1' as const;
export const PREVIOUS_FACTION_SHEET_RENDERER_VERSION = 'faction-sheet-v2' as const;
export const CURRENT_FACTION_SHEET_RENDERER_VERSION = 'faction-sheet-v3' as const;

// Convex must continue to understand stored publication and rollback versions.
// The current Worker intentionally executes only v3; a v2 rollback redeploys
// the previously verified Worker release.
export const KNOWN_FACTION_SHEET_RENDERER_VERSIONS = [
  INITIAL_FACTION_SHEET_RENDERER_VERSION,
  PREVIOUS_FACTION_SHEET_RENDERER_VERSION,
  CURRENT_FACTION_SHEET_RENDERER_VERSION,
] as const;

export const SUPPORTED_FACTION_SHEET_RENDERER_VERSIONS = [
  CURRENT_FACTION_SHEET_RENDERER_VERSION,
] as const;

export type KnownFactionSheetRendererVersion =
  (typeof KNOWN_FACTION_SHEET_RENDERER_VERSIONS)[number];

export type SupportedFactionSheetRendererVersion =
  (typeof SUPPORTED_FACTION_SHEET_RENDERER_VERSIONS)[number];

export function isKnownFactionSheetRendererVersion(
  version: string
): version is KnownFactionSheetRendererVersion {
  return KNOWN_FACTION_SHEET_RENDERER_VERSIONS.some((knownVersion) => knownVersion === version);
}

export function isSupportedFactionSheetRendererVersion(
  version: string
): version is SupportedFactionSheetRendererVersion {
  return SUPPORTED_FACTION_SHEET_RENDERER_VERSIONS.some(
    (supportedVersion) => supportedVersion === version
  );
}
