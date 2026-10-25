# Play colour audit

This audit covers the 22 swatches previously grouped as "Game artwork and renderer colours" in the
local preview on 2026-10-23. The game material values remain unchanged; the UI rows below record their consolidated values. They were fixed code values, rather than
colours read from faction or asset records. The group mixed procedural game materials, UI overlays,
fallbacks and neutral rendering utilities.
Swatches show base values before scene lighting, tone mapping and overlay opacity.

UI colours now live in [`uiPalette.ts`](../../src/shared/uiPalette.ts), exported as `playUiColors`.
Procedural game materials live in [`assetColors.ts`](../../src/shared/play/assetColors.ts), exported
as `gameAssetColors`. That file also names the neutral `rendererColors` separately. Only UI roles
generate CSS variables. Faction and alliance identity colours continue to come from game data.

## Procedural game materials and fallback artwork

These twelve swatches paint geometry or locally drawn artwork. The referenced assets supply shapes,
images or content; the colour values below are declared in code.

| Colour | Code role | What it paints | Associated asset or source |
| --- | --- | --- | --- |
| `#EAD9BB` | `pieceAccent` | Exposed card-stack edges and the default accent stored on newly created pieces. Stored accents paint unprinted token faces and bands, marker tips, and placeholder card panels. | Generic piece materials, rather than one card or faction asset. [`TabletopScene.tsx`](../../src/app/widgets/tabletop/TabletopScene.tsx), [`setupSupply.ts`](../../src/shared/play/setupSupply.ts). |
| `#B8842F` | `spiceStack` | The cylindrical sides of each physical spice-token layer. | The published [Spice token](https://dune.zone/assets/token-disc/spice). Its printed face loads independently. [`SpiceLayers`](../../src/app/widgets/tabletop/TabletopScene.tsx). |
| `#F6D77F` | `spiceFallbackFace`, formerly `turnDial` | The inner circular face of a spice token while its published face is unavailable. It does not paint the turn dial. | Fallback for that same Spice token. [`SpiceFace`](../../src/app/widgets/tabletop/TabletopScene.tsx). |
| `#6B431D` | `spiceIcon` | The extruded spice glyph on the fallback token face. | Shape from [`/vector/icon/spice.svg`](../../public/vector/icon/spice.svg); colour supplied by [`SpiceStackIcon.tsx`](../../src/app/widgets/tabletop/SpiceStackIcon.tsx). |
| `#F7BA7A` | `mapStronghold` | Stronghold territory triangles while a retained board's complete artwork is loading or unavailable. | Retained board definitions with territory type `stronghold`. [`authoredBoardGeometry.ts`](../../src/app/widgets/tabletop/authoredBoardGeometry.ts). |
| `#A67A3E` | `mapRock` | The equivalent fallback fill for rock territories. | Retained board definitions with territory type `rock`. Same renderer. |
| `#F6D979` | `mapSand` | The equivalent fallback fill for sand territories. | Retained board definitions with territory type `sand`. Same renderer. |
| `#EEE7AD` | `phaseDisc` | Inactive phase-disc faces and bodies, the turn-wheel face, and the default face for a symbol disc. | Phase icon shapes from the current ruleset's phase declarations. Standard paths are listed in [`phases.ts`](../../src/shared/play/phases.ts). [`PhaseSymbol.tsx`](../../src/app/widgets/tabletop/PhaseSymbol.tsx), [`TurnTracker.tsx`](../../src/app/widgets/tabletop/TurnTracker.tsx). |
| `#111111` | `phaseInk` | Phase glyphs and their circular rings; turn-wheel numbers, frame and pointer. | The same phase icons and procedural turn wheel. The spice-bank glyph also uses this ink. |
| `#E3DBB3` | `predictionPaper` | The light outline around the chosen faction logo and predicted turn number. It is not the card's paper background. | Prediction overlay built from `snapshot.factionArtwork[factionId].logo` and the chosen turn. [`predictionFace.ts`](../../src/app/widgets/tabletop/prediction/predictionFace.ts). |
| `#1C140D` | `predictionInk` | The predicted turn number's ink. The faction logo itself retains its source image's colours. | The same prediction overlay. |
| `#999582` | `spiceDisc` | The spice-bank disc face and body. | Procedural bank disc with the `/vector/icon/spice.svg` glyph, rather than the published Spice token. [`SpiceBank.tsx`](../../src/app/widgets/tabletop/SpiceBank.tsx), [`tableTrackers.ts`](../../src/app/widgets/tabletop/tableTrackers.ts). |

One additional material was previously hidden behind the UI's `placeholder` role. Newly created
Traitor decks store `#D5BA8C` as their base colour. It now has the game-owned role `traitorCardBase`
in `assetColors.ts`, so the supply builder no longer declares the pigment itself. The value is unchanged.

The standard phase glyphs coloured with `phaseInk` are `/vector/icon/storrm_standalone.svg`,
`/vector/icon/spice-blow_standalone.svg`, `/vector/generic/chaom.svg`,
`/vector/icon/bidding_standalone.svg`, `/vector/icon/revival_standalone.svg`,
`/vector/icon/shipment_disc.svg`, `/vector/icon/combat.svg`, `/vector/icon/collection_standalone.svg`
and `/vector/icon/mentat.svg`. Custom rulesets can supply different phase symbols. These SVGs
supply geometry; their source fills do not set the disc material's `phaseInk` value.

## UI overlays and fallbacks previously included in that group

These eight swatches belong to `playUiColors`. None comes from an artwork file or faction record.

| Colour | Code role | Exact use |
| --- | --- | --- |
| `#211D18` | `fallbackFaction` | Background for the hand-count logo when a faction token is missing. [`HandCounts.tsx`](../../src/app/routes/_app/play/multiplayer/HandCounts.tsx). |
| `#BFB09A` | `unknownFaction` | Neutral colour for an unassigned seat's swap token. [`SwapScene.tsx`](../../src/app/routes/_app/play/multiplayer/SwapScene.tsx). |
| `#171511` | `boardDivider` | Narrow divider bars between the board rim's player-station sections. [`TabletopBoard.tsx`](../../src/app/widgets/tabletop/TabletopBoard.tsx). |
| `#D7C299` | `stationGround` | The small circular pad at each player station. It is procedural geometry beneath the faction token. Same renderer. |
| `#C92A2A` | `stormSector` | The translucent sector overlay under the moving storm marker. Same renderer. |
| `#FFA8A8` | `stormEdge` | The outline of that sector overlay. These two reds do not recolour [`storm-marker.webp`](../../src/app/widgets/tabletop/assets/storm-marker.webp). |
| `#1971C2` | `territoryBlue` | Default tint in the "Fremen deployment" territory-overlay preset. It is independent of the Fremen faction's authored colour. [`territoryTintPresets.ts`](../../src/app/routes/_app/play/multiplayer/territoryTintPresets.ts). |
| `#171511` | `territoryBlack` | Default tint in the "Shield Wall destroyed" territory-overlay preset. Same preset module. |

## Neutral rendering utilities

These two values occur in both UI and game rendering. Each palette owns its own neutral roles;
neither palette imports the other.

| Colour | Game rendering uses | UI uses |
| --- | --- | --- |
| `#000000` | The base beneath the map, the prohibition sign on a face-down faction token, and transparent endpoints or opaque centres in shadow textures. | DOM text/drop shadows, canvas hand-count backing and other UI shadows. |
| `#FFFFFF` | An untinted material over a swap-token texture; the white fallback fill for polar territories; the neutral base tint on confetti instances before per-instance colour. | UI text/overlays that use the white neutral role. This value does not replace printed artwork's own white. |

## Artwork outside these swatches

The built-in [`arrakis-map.svg`](../../src/app/widgets/tabletop/assets/arrakis-map.svg) supplies its
own fills and strokes to `boardMapGeometry.ts`. Retained boards receive their complete artwork
through [`authoredBoardTexture.tsx`](../../src/app/widgets/tabletop/authoredBoardTexture.tsx), which
renders the game board asset and its decals. Those full images supersede the temporary terrain fills.

Published faction tokens, troops, leaders and cards retain their image colours. Their material sides
take the faction or piece colour stored in game data. Alliance coins and marker segments use the
allied factions' data colours. The six faction swatches in the grid are examples from
[`src/shared/homepage/artwork.json`](../../src/shared/homepage/artwork.json), not a fixed faction palette.

The swatch grid does not enumerate the pixels inside those SVGs or bitmaps. Similar-looking fixed
swatches can therefore belong to different procedural parts, while a single printed asset can
contain many colours absent from the grid.
