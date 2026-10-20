# Accepted GF9 faction, logo and component treatments

Resolved through live review on 20 October 2026 for [Approve faction, logo and component correction treatments](https://github.com/ndelangen/dunezone/issues/2362). This is the visual and authoring contract for later implementation. The planning map excludes production execution. Earlier exploratory notes, old proofs and the original package are reference inputs, not independent competing specifications.

Later [content acceptance](../acceptance/acceptance-contract.md) and [production-batch](../release/production-batches.md) decisions control delivery order and review gates. They supersede older PDF/physical-proof wording below. The user reviews all four complete local web books, without a human PDF or physical-print approval step. The accepted component appearances and exact data remain unchanged.

## Identity and visible names

Use the existing GF9 Ruleset and Group. All associated assets belong to that Group. Preserve production entity IDs, owners, member UUIDs, ordering, references, deck quantities and unrelated stock. Resolve authoring keys to verified destination records through the map's authenticated workflow. Never infer an owner from the package.

Remove the literal leading `GF9 ` from visible faction and asset text. Keep internal keys and permanent identities. This includes the twelve factions `gf9-atreides`, `gf9-harkonnen`, `gf9-emperor`, `gf9-spacing-guild`, `gf9-fremen`, `gf9-bene-gesserit`, `gf9-ixians`, `gf9-tleilaxu`, `gf9-richese`, `gf9-choam`, `gf9-ecaz` and `gf9-moritani`, plus visible titles on associated cards and components.

Restore Captain Iakin Nefud, Margot Lady Fenring and Premier Ein Calimar through the existing member UUID mappings in ../leader-labels.json. Retain strengths, portraits, quantities and identities. Restore Rock Outcroppings and Habbanya Ridge Flat from their shortened display forms. Never abbreviate a name to fix a renderer.

## Ruleset image, portraits and faction sheets

Use public/art/gf9-ruleset-tile.png for the existing Ruleset image. It centers the complete genuine GF9 mark on the accepted dark square. Provenance and pixel bounds are in art-manifest.json. It is separate from the already accepted book covers.

Use the wider source-preserving crops: Malina 150 by 150 pixels and Ilban 162 by 162 pixels. Their original source tiles, bounds and hashes are recorded in art-manifest.json. Register those exact crops through the normal media pipeline. Do not generate portrait detail or substitute Cheap Hero artwork. Their limited native resolution was accepted.

Apply CHOAM's existing textured gradient only to CHOAM, with red above black. The exact two gradients and texture controls are in art.tsx, choamBackground. Preserve CHOAM's deliberately empty shared logo; no invented emblem or special logo renderer exception. Richese retains its uniform grey background.

Keep the Bene Gesserit reversible troop `to:` connector visible. Apply circular clipping to troop artwork containers only, including the independent non-GF9 regression example. Retain the complete accepted Ecaz/Vidal advantages, including revival eligibility, Ghola, price and neutral-return clauses from the content audit. Keep the settled short labels and full names/effects beside the book illustrations. These are editorial clarifications, not new mechanics.

## One card-title responsibility

Treatment A is accepted globally. Implement shared loaded-font title fitting across every card type, with HTML and SVG adapters where needed. Keep the full name on one line, reserve icon clearance, preserve each renderer's baseline and typography, and finish fitting before publication readiness. Never wrap, clip, cap, truncate or abbreviate a title. Do not ship the prototype's hiding selectors or title overlay.

The complete renderer inventory, font lifecycle, edge cases and regression requirements are in shared-card-title-contract.md. Test ordinary and long inputs, same-instance name changes, font readiness and non-GF9 consumers. Reuse the existing title ownership rather than adding per-card-type heuristics.

## Karama replacement

The accepted text-only design and exact 705-character replacement transcription are in remaining-card-data.json, karama. The main-deck card uses the hand badge and has two copies; the separate Richese cache member uses its Richese badge. Preserve the current entity identities and Treachery type. Additional book procedures remain off the face; FAQ entries remain out of the books.

The prototype uses the existing plain Custom Card frame only to demonstrate the desired Treachery format. Expose a backward-compatible text-only Treachery treatment rather than converting Karama to Custom Card. Its accepted native Candara body size is 38.75. Physical main and cache provenance are in remaining-source-comparison.md and local-card-source-manifest.json. The previous meditation illustration and obsolete core wording are rejected.

## Discovery cards

Use all six card records in remaining-card-data.json. Each remains one copy, amount six, with the recorded separate blow and Discovery destinations. Preserve the two bold spans in the stored formatted text. Do not substitute plain text or move complete procedures onto the face.

Convert the six existing Custom Card records to actual Spice records through the narrow normal authenticated flow specified in spice-conversion-requirements.md. Preserve IDs, ownership, Group, deck membership, address history and dependent references. Refresh reverse dependencies and publications. Do not create duplicate replacement cards or perform an administrative conversion.

Use the existing linked arrakis-official board. Resolve the package binding gf9-board to that existing entity. Use its actual geometry, native territory tints and placed token assets. No embedded map images, new board geometry or printed board-label feature is required.

The blow tint is darker orange #ad4e10d9. Hiereg destination tints remain #315c51b0 and Smuggler destination tints #355b8ab0. Both territories are tinted on every card. The accepted marker points and source mapping are recorded in the data and native-board-position-checks.json; all twelve points must remain within their intended territories and sectors. Tints use whole logical territories. Sector-specific tinting is not part of this treatment.

Preserve the accepted map recipe: brightness 0.55, contrast 2.6, saturation 0, paper saturation 0.65, opacity 1, colour-burn blending and downward shift 28 native units. Native map top is 263. Board, tints, paper and marker placement boxes move together. Only board/paper are filtered; tints and token colours remain independent. The paper is an aligned copy of the existing card texture. Do not use the rejected SVG backdrop filter.

The amount retains ordinary Spice placement, bottom 130 and right 100. The instruction region reserves its column, native width 580 and Candara size 40, line-height 1.15. A generic Discovery type token is above the amount at right 102, bottom 240, size 95 by 95 native units. Implement that as one fixed renderer arrangement and a validated token reference, not author-entered coordinates or independent per-card hacks. The prototype demonstrates the slot; saved Spice data does not support it yet.

The normal header uses the established Spice background. Existing Fremen/Guild vectors are accepted. The latest token decision changes token artwork, not the accepted header footprint. The apparent header badge offset was caused by the prototype's global border-box reset. Restoring real content-box sizing fixes it. No application badge-offset fix is required.

## Discovery token faces and hidden backs

The eight revealed outcomes remain Jacurutu Sietch, Shrine, Ecological Testing Station, Cistern, Orgiz Processing Station, Treachery Card Stash, Spice Stash and Ornithopter. Preserve gameplay identities, pool membership and quantities. The accepted revealed-face representatives are Orgiz Processing Station and Ecological Testing Station in native-token-samples.tsx. They use one central existing vector and separate inverse radial backgrounds. Their exact styling is size 185 in a 300-unit face, fill #07120f, stroke #f3edbf and strokeWidth 5.5. The other revealed faces require source-backed matching existing artwork and full local verification. This does not approve unseen output or the old generic spice-glyph faces. Omit extra effect icons and numbers. Explain the effects beside their book illustrations. Do not add general token composition layers.

Persist and expose optional symbol fill, stroke and strokeWidth through the existing TokenFace contract and editor. CustomToken already accepts those renderer inputs; defaults must preserve existing content. Carry the styling through normal preview, print and publication projections. The prototype passes these inputs directly, so the saved-data/editor work remains required.

The hidden backs and two generic type-marker fronts use one new shared grayscale texture, /image/texture/hiereg-discovery.png. Exact colours, inversion, definition and influence are in token-back-backgrounds.json. Hiereg uses existing /vector/logo/fremen.svg. Smuggler uses existing /vector/logo/guild.svg. Both have symbolScale 2, no curved labels and no extra white edge ring. The texture supplies its own decorative rim. The accepted proof also has no symbol shadow.

Add an optional symbol-shadow setting to the existing round-token contract/editor and CustomToken renderer, following the existing ring-shadow pattern. Missing means the current shadow treatment, preserving all existing consumers. Set it off for these approved backs/markers. This small persisted control is needed because the accepted proof currently disables the renderer's fixed shadow through scoped CSS. It does not authorize unrelated token layout controls.

Apply each type's settings to its four hidden gameplay backs and the corresponding generic illustration marker. Generic markers are ordinary token-disc assets assigned to GF9; they never become extra random Discovery outcomes. Native placed-token rendering can keep using their fronts. No new face/back selector is needed.

The texture was extracted/restored with built-in imagegen, then revised to remove the unwanted outer circumference and neutralize its colour. The existing Sharp texture pipeline normalized the final source to single-channel grayscale. Prompts, hashes and provenance are in hiereg-texture-provenance.json and the two prompt files. A durable identical raster is in public/token-art/hiereg-background-grayscale.png. The draft source is staged at media/image/texture/hiereg-discovery.png. Ingest only these exact approved bytes through the normal media pipeline, register the texture catalogue key and generate normal variants before saving authenticated records. Do not regenerate it or upload a coloured original.

Both attempted new vectors were rejected and removed. Use existing vectors only. The accepted token proof is ?case=token-backs, with all new-svg paths absent.

## Verification and delivery gates

The local prototype has no Convex connection or production writes. It establishes product choices; it is not the required working local Dune Zone review copy. Normal implementation must still supply the isolated app, exact saved data, publication/capture and PDFs, under the existing map decisions.

Keep permanent evidence on this branch. Capture the accepted token proof and native card measurements. After implementation, verify authenticated Load/Save and media picking, card-title settlement, conversion identity/address/dependencies, exact formatting/bold, zero missing images, no clipped bodies, original artwork proportions, and actual-size prints. Inspect regenerated images and PDFs for all affected assets and one ordinary/non-GF9 regression per shared renderer change. The low-resolution original references limit detail and were accepted; no upscale can create source detail.

Before production, review the concrete local manifest and rendered outputs without reopening accepted designs. Then follow the map's two controlled content batches, factions/assets/logo first and the four books second after dependencies publish. Use normal signed-in flows and preserve the verified owner and Group. Code deployment is separate. Every implementation PR needs separate Astra High code and architecture reviews at its exact final head, resolved valid findings, required CI/audits, normal merge, deployment and public-output verification.
