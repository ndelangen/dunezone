# GF9 component treatment prototype

Throwaway review code for [Approve faction, logo and component correction treatments](https://github.com/ndelangen/dunezone/issues/2362). This is a read-only renderer comparison, not the working local application required by the implementation map. It has no Convex connection and makes no content writes.

Run from the repository root:

```sh
bun content/gf9/component-prototype/serve.ts
```

Open http://127.0.0.1:39612/?case=labels for the six remaining Discovery Spice cards. Add `&cardZoom=2` for an enlarged view. The earlier card/token inventory remains at `&review=archive` and is not a request to re-review accepted work. Other cases are `art`, `headers` and `factions`. Accepted covers and book compositions live in their separate prototype and do not need reapproval here.

The user accepted the six Discovery Spice cards on 20 October 2026, including the darker orange tint, standard amount position, token above the amount and preserved bold content. Keep that composition settled. The active review now concerns only Hiereg and Smuggler token backgrounds, at `?case=token-backs`.

## Accepted decisions

- Use both wider verified original faction-head crops. Preserve their native source resolution and provenance.
- CHOAM alone has the red upper and black lower textured gradient. Its shared logo remains intentionally empty. Richese retains its uniform grey background.
- Use the genuine Gale Force Nine mark centered on the shown dark square for the existing Ruleset image.
- Fit complete card titles on one line through one shared UI responsibility. Never wrap, truncate, clip, abbreviate or cap a title. All card types must consume the shared behavior in production, including backs through an SVG adapter. Preserve established typography and icon clearance.
- Restore complete supporting-leader names and full Spice territory names. Remove the literal `GF9 ` prefix from visible text on every associated asset. Internal keys and permanent identities retain their namespace.
- Keep the visible Bene Gesserit flip connector and complete Ecaz/Vidal advantages. Short token labels may have full names and effects beside their book illustrations.
- Discovery tokens use one central vector with a radial textured background and clear outline. Omit the original small effect icons and numbers. Explain their effects in the rulebook. Do not add token composition layers for those decorations.
- Karama uses the later CHOAM & Richese replacement. The active deck has two corrected copies, with a separate Richese cache member. Do not display obsolete base copies as current cards.

Each live decision is recorded on the issue. The refined one-vector Discovery token samples were subsequently accepted. Their prior generic gold artwork remains rejected. Do not reopen the accepted token, sheet, portrait, logo or header treatments.

## Corrected preview bugs and evidence

The server now serves generated normalized public vectors, falling back to maintained public production assets. Serving raw `media/vector` files had drawn only a sliver of the map in Spice cards. The renderer itself correctly expects the normalized map.

`PrototypeCardTitle` is shared by accepted Header A and the card examples. It measures the actual loaded Copperplate font, preserves the full name and reserves icon clearance. This throwaway overlay proves the treatment. The production implementation must migrate every title consumer, remove duplicate heuristics and integrate settlement into existing publication readiness. It must not ship these hiding/overlay selectors.

`bun content/gf9/component-prototype/verify-corrections.ts` checks the corrected map contract, sample title identity, single-line fitting, missing images and runtime failures. It writes ignored evidence under `output/`. `inspect.ts` covers eight review routes. `export.ts` creates an actual-size PDF, but earlier exports include rejected artwork and are not accepted final proof.

## Current review

Karama is accepted. Preserve its verified text-only face, hand badge on the two main-deck copies and Richese badge on the separate cache member. The active preview shows only the six Discovery Spice cards. The accepted Karama reference remains available through `&accepted=show`.

The Discovery cards must use the existing `SpiceCard` renderer with a link to the existing `arrakis-official` board, territory tints and placed tokens. The user rejected embedded map artwork and pasted bitmap header badges. They use the normal Spice header background and existing Fremen/Guild vectors from the current Discovery token backs. Newly drawn fruit and goggles icons were rejected. The original card images are comparison references only.

Existing tints cover whole territories. Source-derived marker points identify the spice and Discovery locations, with exact sectors retained in `about` and the rulebook. The native board definition is the recorded `gf9-board` item from the authored package. Resolve its key to the existing destination board, never create a replacement board. Validate both placed markers against the native territory geometry before publication.

The six original records are `card-custom`. Current Save, Load and import cannot change that type. The required authenticated Custom-to-Spice conversion must preserve ID, owner, Group, deck quantities, Ruleset links and address history, validate the destination data and refresh publication dependencies. See [conversion requirements](spice-conversion-requirements.md). Do not use an administrative identity or silently create duplicate replacements.

Generic Hiereg and Smuggler illustration-marker token assets can use existing token fronts and board placements. They are not extra random outcomes. No new vectors are permitted or required. Both blow and Discovery territories receive different tints, with markers on top. The standard Spice schema already accepts vector icons, so no full-colour header-image feature is needed. Do not implement the rejected bitmap badge route.

The accepted Karama proof reuses the existing plain Custom Card frame at native Candara 38.75, about 7.7 pt at 63 mm. Its production record remains Treachery. Expose that text-only format through the shared renderer rather than converting its type. Its 705-character source transcription was independently compared with the physical main replacement and cache face. Additional book rules remain off the printed face.

`local-card-source-manifest.json` records the supplied Discovery source and reference crops. [Current source comparison](remaining-source-comparison.md) records the later physical Karama verification and rejected approaches. Earlier generated maps, badges and proofs are retained locally under ignored `output/rejected-card-drafts/`; none is current proof or accepted production artwork.

The [shared title contract](shared-card-title-contract.md) remains settled. One loaded-font measurement path must fit full card titles across all card types. The current prototype reuses its accepted shared overlay; production must integrate that behavior into the actual shared title renderer and publication readiness.

## Publication and delivery

No production renderer or application record has changed. This branch is evidence for the planning issue, outside main. Later implementation needs normal authenticated local and production flows, appropriate renderer revisions, publication recapture, required CI and separate Astra High code and architecture reviews at the final PR head.

## Map filter and spacing preview

The user accepted the map treatment on 20 October 2026. The current custom controls expose brightness, contrast, map saturation, paper saturation, opacity and vertical position, plus a blend selector. Every change updates the URL without a reload. The sticky controls remain visible while inspecting lower cards. Reset restores the accepted recipe.

Current presets remain available for comparison. The custom proof applies its filter to board artwork only, leaving the orange spice tint, green Hiereg tint, blue Smuggler tint and token colors independent. Paper saturation uses a circular, aligned copy of the existing card-paper texture beneath the native board. A backdrop filter on the SVG caused unstable blending and was removed. Verify that treatment in the actual publisher capture and PDF before committing to a production filter contract. Accepted values are brightness 0.55, contrast 2.6, map saturation 0, paper saturation 0.65, opacity 1, vertical offset 28 and color-burn blending. The exact recipe is also stored in remaining-card-data.json.

The map, tint overlay and placed-token box move together. The accepted map top is native 263, 28 below the existing 235. The amount retains the ordinary Spice renderer's bottom 130 and right 100 placement. Discovery instructions reserve the amount column, keep their bold markup and use one consistent 40-unit text size. A generic Discovery token sits above the amount in this proof. That fixed token slot and the instruction arrangement need a supported shared renderer contract before implementation, rather than per-card positioning.

The badge offset was caused by the prototype's global border-box reset, not by the existing renderer. Restoring the real renderer's content-box sizing aligns the complete badge with the printed ring. The earlier claim that its shade offsets were a shared renderer bug was incorrect. No application badge correction is needed.

The spice-blow tint is now darker orange, #ad4e10d9, across all six cards. Hiereg and Smuggler destination colors remain green and blue.

Spice territories are orange. Hiereg destinations and markers are green; Smuggler destinations and markers are blue. Both territory tints are present on every Discovery card. Only existing Fremen, Guild and spice vectors are used.

## Hiereg and Smuggler backgrounds under review

The user accepted the six Discovery Spice-card compositions and requested backgrounds closer to the GF9 originals for the two Discovery token types. The focused comparison is `?case=token-backs`. Native embedded back images from page 12 of the supplied Ecaz & Moritani book are references only; provenance is in token-back-source-manifest.json.

The proposed background data in token-back-backgrounds.json uses existing Background schema fields, the existing 082 texture and radial gradients. Hiereg is mottled ochre-gold. Smuggler is muted dark slate. Horizontal stripes are removed. Symbols, rings, token shape, labels and accepted revealed faces are outside this revision. The two generic illustration markers consume these proposals; implementation should use the corresponding background on each type's hidden backs as well, without adding generic markers to the random outcome pool. No new renderer capability or vector is required for this background change.

These backgrounds await user review. Their colours are independent of the accepted green Hiereg and blue Smuggler territory tints. Card typography, amount placement and map recipe remain settled.
