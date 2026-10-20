# Discovery conversion and placed-token capability

Read-only source investigation. No changes to application code or production.

## Existing writes cannot change Custom Card type

`convex/assets.ts` normal `update` accepts `{id,data}` and explicitly treats type as immutable. It parses against `row.type`, validates that type's references, patches data/slug and republishes the same type. JSON Load followed by this ordinary Save cannot convert an existing card-custom to card-spice.

`convex/contentImports.ts` also enforces type equality. Existing-target lookup uses type plus slug; ID/receipt resolution rejects `row.type !== item.type`. Its update branch calls the same normal `api.assets.update` writer. Changing only an import item's type either fails existing lookup/type validation or creates a separate new asset if no existing target is requested. It does not preserve the six original identities.

The one existing conversion mutation is `convertTreacheryToCustom`, and it is admin-only. It cannot convert Custom to Spice, and it is not evidence of an existing owner-authenticated conversion capability.

## Narrow future conversion if identity preservation is required

Specify an explicit Custom Card to Spice Card conversion through ordinary authenticated application permission checks. It is a distinct reviewed operation, not a hidden behavior of raw JSON Load. It receives the source identity and complete validated destination Spice data, verifies the live source is card-custom, requires normal asset update/rename authority, validates the linked board and tokens, and changes only that requested card.

Preserve asset ID, owner, Group, deck membership quantities and Ruleset relations. The type is part of its public URL, so preserve the old address with the established former-slug mechanism. The slug itself can be retained only if it is free in the target card-spice namespace; collision handling must be explicit and reviewable.

Remove old custom-card-token reverse dependencies, add Spice board/token reverse dependencies, supersede pending old-type publication, enqueue destination publication and refresh dependents. Check live Rulebook references and saved/publication projections for type assumptions. Do not infer that retaining ID alone preserves every renderer contract. Keep completed historical artifacts as required by the existing publication policy.

This is a narrow possible plan, not implemented behavior or authorization for an administrative conversion. A create-and-relink replacement is technically possible with existing operations but changes identities and adds relation updates, so it does not satisfy the already stated preservation requirement without a fresh explicit decision.

## Board placement draws fronts only

`src/shared/boards/markup.ts` BoardTokenPlacement stores layerId, asset_id, x, y, size and rotation. There is no face, side or back selector.

`convex/lib/spiceCardBoard.ts` resolves placed tokens with `resolveCustomCardTokens`. Its `tokenFront` in `convex/lib/customCardTokens.ts` always resolves `.data.front`. The renderer passes that resolved front to CardToken. Token custom/same/reference back modes exist elsewhere, but are not selectable through board placement.

Two generic type-marker assets are therefore a valid existing-capability solution: a Hiereg marker and a Smuggler marker, each a normal token-disc whose front shows the type-back emblem. Place those fronts on the card maps. They are illustration markers, not additional random Discovery outcomes or replacements for the eight gameplay Discovery tokens. Assign them to GF9 and preserve the real pool and quantities. Use source-backed registered vector artwork for the current CustomToken SVG-symbol renderer; arbitrary PNG `#root` references are not working token-symbol inputs.

Adding a back selector is unnecessary if those two marker fronts meet the requested composition.

## Tints have a separate limit

Existing linked Spice boards, territory tints and placed tokens are real supported capabilities. A tint currently selects whole logical territory IDs, and drawTint fills each selected territory.face.path. There is no sector selection or sector clipping in BoardTint. Free XY token placement can use a verified sector point, but cannot turn a whole-territory tint into the original sector-only ochre highlight.

Use the existing geometry honestly. If exact original sector tinting is required after reviewing the native version, specify that small extension separately. Do not disguise a precomposed image as editable board markup or change the accepted shared board merely for one card illustration.
