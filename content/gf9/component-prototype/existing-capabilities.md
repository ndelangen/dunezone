# Existing GF9 card and token capabilities

Historical investigation. The final choices are in [accepted-component-spec.md](accepted-component-spec.md). Do not implement rejected alternatives from this note.

Read-only source inspection, 20 October 2026. No renderer, data or production changes made for this investigation.

## What the current preview actually shows

`content/gf9/component-prototype/labels.tsx` loads the old `content/gf9/package.json` data without correction. Its opening comment says exactly that. The card/token panel is an inventory and clause-retention proof. It does not propose improved visual fidelity.

Both Karama faces have `decals: []`. The displayed Discovery Sihaya Ridge card contains only one text layer. Empty illustration areas on these samples are an authoring omission. Existing card decal support can draw artwork there.

The token examples are arbitrary 25 mm samples, always showing the front. They do not use each stored token's `physicalSize`, and they do not compare the original GF9 face or back. Do not treat this panel as original-format approval evidence.

## Existing capability by component

| Concern | Existing capability | Limit relevant to original GF9 faces |
| --- | --- | --- |
| Ordinary disc/gear/square/pointer token | Patterned two-color or gradient background, one centered symbol, symbol scale 0.5–2, optional ring/shadow, one top and two bottom labels, custom/same/reference back | Symbol, ring and arc positions are fixed. Arc font, size, white color and shadows are fixed. No free text/decal layers on these faces. Pointer intentionally has no labels. |
| Token shape | Round, gear, square, rectangle and pointer are existing Asset types. Consumer clips the published image using the maintained outline. | Shape follows Asset type, not an arbitrary per-face path. Current gear outline is the maintained ten-tooth shape, not a user-supplied original die-cut path. |
| Rectangle token | Background, ordered positioned vector decals, positioned multiline text with seven selectable fonts, opacity, scale and optional shadows | Rectangle-only schema and renderer. Text color is white and shadow is built in. Its decals use SVG `#root`, so arbitrary raster artwork is not an existing rectangle-decal capability. |
| Treachery card | Fixed native 900×1263 card template; raster/vector decals with scale, XY offset, muted/outline treatment; formatted body text; shared category front styles | Body font, dimensions and position are fixed. Shared head/type/icon layout is fixed. Front styles are shared presets; changing them is not a GF9-only local data tweak. |
| Custom Card | Existing 900×1263 native card; plain/decal-window frame, movable art window; up to 256 ordered text/decal/token layers; text width/height/size/font/color/alignment/opacity/rotation/XY; raster/vector decals; token references | Standard title/type/icon and parchment frame remain fixed. Arbitrary original card frame/background replacement is not a stored field. Exact original typography requires an available font and compatible fixed head. |
| Ordinary Spice card | Highlighted territory map, amount, icon scale/offset, caption, optional linked board with tints/tokens and plain/burnt/sepia look | Fixed circular map and body/count positions. `overlays` exists in the stored contract but is not exposed by the ordinary editor. A linked board must be resolved by the caller. |
| Backgrounds | Existing stock texture/background catalogue with two colors; linear/radial gradients with stops and angle; texture contrast, inversion and influence | This is a recolored pattern-mask treatment, not a full-color uploaded original-face-image field. Do not pretend a texture import preserves original illustrated color artwork. |

Sources: `src/shared/assets/schema.ts`, `src/shared/assets/tokenOutline.ts`, `src/shared/factions/schema.ts`, `src/game/assets/token/Custom.tsx`, `src/game/assets/token/Rectangle.tsx`, `src/game/assets/card/Custom.tsx`, `src/game/assets/card/Decals.tsx`, `src/game/assets/card/Spice.tsx`, `src/game/assets/treachery/Treachery.tsx` and the corresponding existing editor widgets.

## Authoring corrections that need no new feature

- Fill the Karama illustration areas with suitable source-backed artwork through the existing decal fields. Their blank state is caused by empty decal arrays.
- Add the missing Discovery illustration/map through existing Custom Card decal layers. Keep explanatory text in existing text layers.
- Retune existing text layers and decals in card coordinates. The old `[-300, -250]` offsets are not rulebook coordinates and are not a missing positioning control.
- Improve token backgrounds, symbols, ring settings, type choice and face/back authoring where the existing fixed token composition is sufficient.
- Give CHOAM its accepted split gradient through the existing gradient contract. Preserve the deliberately empty CHOAM logo. Do not give Richese a split gradient.
- Match original component identities and use the full available name where it can fit. Abbreviations being mechanically harmless does not make the current graphic treatment acceptable.

## Real limitations if original-face fidelity requires them

A disc/gear face cannot currently reproduce an original layout requiring off-center symbols, straight or independently placed text, multiple illustrations, different label typography/color, or full-face raster artwork. These are actual schema and renderer limits, unlike missing card text positioning.

Custom Cards already support most body composition. They cannot replace the standard header/frame through stored authoring data. Ordinary Treachery bodies remain fixed. If a rejected original needs those changes, specify the smallest backward-compatible extension only after comparing the original and a properly authored existing-capability sample.

Do not solve the token limitation by changing a disc into a rectangle, precomposing the entire face into a symbol that silently defeats scaling, or replacing the game component with a rulebook illustration. Do not change shared category front presets to correct only GF9 records.

## Preview and renderer issues to keep separate

- The panel's raw old package content is the main preview problem. It has no original-versus-proposed artwork comparison.
- `CustomToken` draws the supplied symbol with SVG `<use href="...#root">`. Although the broad `ALL` schema contains raster entries, a raw PNG/JPEG is not a working SVG symbol. Existing token UI restricts the symbol picker to vectors. A raster selected by a broader import is not evidence that raster token faces are supported.
- The token renderer has hard-coded `top-text` and bottom arc IDs. Multiple same-shape samples currently share the same geometry, so this does not explain their rejected look. It is a separate renderer robustness concern, not a reason to redesign the visuals.
- The native card preview uses the real 900×1263 renderer scaled to 63 mm width. Token 25 mm sizing is only a sample choice. Actual print size and original die-cut outlines require their own evidence.
- `about` is off-face prose. Displaying it next to a component in this panel does not restore omitted printed artwork or make a face a faithful reproduction.

## Suggested next decision evidence

Show a small set of source-backed originals beside improved samples built through existing data fields: one Karama, one Discovery card and one representative token whose original composition uses a materially different text/art arrangement. Label any residual limitation precisely. Decide whether the improved native treatment is sufficient or whether that specific token composition needs an extension. The accepted faction sheets, labels and covers do not need another review.
