# Shared card title fitting contract

Read-only investigation, 20 October 2026. No source edits or new tests.

The user's rule is global: card titles remain complete on one line. Never wrap, truncate, ellipsize or abbreviate a title to make it fit. The renderer reduces type size to fit the available title region. Do not add per-asset title-size overrides or repair only Spice cards.

## Current title paths

| Renderer | Title path now | Existing sizing |
| --- | --- | --- |
| TreacheryCard | CardHeadContents | Copperplate, base 60, 560-unit width, estimated character-width helper |
| CustomCard | CardHeadContents | Same |
| LeaderSkillCard | CardHeadContents | Same |
| StrongholdCard | strongholdCardComposition → CustomCard → CardHeadContents | Same |
| StormCard | CustomCard → CardHeadContents | Same, generated `1 Sector` / `N Sectors` |
| NexusCard | CustomCard → CardHeadContents | Same |
| HomeworldCard | CustomCard → CardHeadContents | Same |
| SpiceCard | Direct Card.module.css title div | Copperplate 60, 640×86 fixed box, hidden overflow, no fitting |
| TraitorCard | Direct Card.module.css title div | Same; owner subtitle separately fixed 470×67 |
| AllianceCard | Direct Card.module.css title div | Same; title can collide with the decorative icon before exhausting its current box |
| CardBack | SVG repeated text/mask/shadow label | Busorama base 90, measured shrink to 680-unit width after explicit font load |

Prediction, Discovery and reference faces authored as Custom Cards follow the shared head path. CardToken draws a token within a card, not a separate card title. Effect-section headings and faction-sheet headings are separate concerns.

The current `cardTitleFontSize.ts` estimates Latin character widths and does not measure the loaded font. It returns a synchronous guessed size and only CardHead uses it. No general FittedText utility exists. CardBack already implements actual SVG text measurement; CardEffects implements body fitting; LeaderSkill observes body overflow. These are useful patterns, not interchangeable title contracts.

## Recommended reusable implementation

Create one renderer-owned fitting utility under `src/game/assets/utils`, with a small HTML title component and an SVG-compatible adapter if necessary. All paths above consume the same fitting calculation and lifecycle. Preserve each card's established typography, alignment and title baseline.

Inputs are the complete text, actual font family/weight/style/letter spacing/text-transform, base size, available width and height. Width is the title region after reserving icon space and a deliberate gap. It is not merely the old CSS box width. For standard fronts, the existing 560-unit CardHead region is the initial shared geometry to verify. Alliance and Traitor should use that same header clearance rule where their icons occupy the same area. Subtitle fitting uses its own existing region and font.

Algorithm:

1. Render the complete name as one non-wrapping span or SVG text node. Keep the accessible text identical to the stored full name. Do not write a shorter name back to data.
2. At the base size, measure actual text advance in native renderer units using the applied, loaded font. For HTML, use an unwrapped measurement span's layout width or actual canvas metrics with matching CSS. Avoid bounding-client-rect width without correcting for an ancestor preview transform. SVG can use getComputedTextLength.
3. Reduce font size proportionally to available width, then verify the actual result. A small finite convergence loop can account for font rounding. Never increase beyond the normal base size. Empty text must avoid division by zero.
4. Verify height and painted glyph bounds as well as width. Keep the established line box/baseline so smaller titles stay aligned. Do not rely on overflow:hidden as the success condition.
5. There is no hard minimum that permits clipping for exceptionally long input. The full title still fits. A readability warning may be reported separately, but cannot justify clipping or changing the name.
6. Refit when text, font/style, available dimensions or font readiness changes. A prior long title must not leave the next short title permanently small. Use normal base size as the starting point every time.

A shared algorithm with HTML and SVG adapters is sufficient; converting all card back masks into HTML or redesigning all cards is unnecessary. Remove the character-class estimator once no caller needs it. Keep ordinary rules/body fitting independent.

## Fonts and capture readiness

Use the existing exact font contract in `src/shared/asset-publishing/publisher-fonts.ts`. PublisherCapture currently waits for paint, document.fonts.ready, exact required fonts, HTML images and SVG resources before measuring geometry and setting CAPTURE_PROTOCOL ready.

Title fitting must finish after its exact font is available and before that ready marker can authorize capture. Avoid a React state update queued after an awaited font promise that is not itself awaited by publication. A synchronous DOM fit after font readiness followed by a stable paint is suitable. If the existing effect order cannot guarantee this, expose a small renderer-settlement signal and await it from the existing capture flow. Do not invent a separate screenshot protocol or duplicate marker names.

Use CAPTURE_PROTOCOL imports for any capture integration. Font failure should preserve the existing failed-capture behavior rather than publishing a guessed fallback-font fit. The initial pre-font fit can keep ordinary screen previews readable but is not final evidence.

## Data corrections enabled by the renderer fix

Restore full printed Spice names `Rock Outcroppings` and `Habbanya Ridge Flat`. Their current data names are `Rock Outcrops` and `Habbanya R. Flat`; the full forms survive in about and territory identifiers. Preserve all amounts, sectors, highlights, identities and deck quantities.

Review the 61 derived leader labels as data corrections too. Existing names `Cpt. Iakin Nefud`, `Margot Fenring` and `Ein Calimar` were shortened for old title boxes. Restore the source-backed full names where that was the intended original identity, using the existing stable member IDs. Do not invent expansions from abbreviations; use the already reviewed mapping in `content/gf9/leader-labels.json`: Captain Iakin Nefud, Margot Lady Fenring and Premier Ein Calimar. Do not silently reorder Margot's title. The global renderer must work for all factions, not only GF9.

Removing the literal GF9 prefix from visible text on all associated assets is already required and remains separate from title fitting. Permanent identities and internal package keys stay unchanged. Owner subtitles still need to fit for arbitrary long faction names.

## Regression evidence required before implementation approval

For every renderer path in the table, exercise a normal short name and a much longer name. Include spaces, a long unbroken word, punctuation, accented/Unicode text supported by the font, and a name changed from long to short without remounting. No newline may create a second title line; normalize display whitespace without deleting words.

Specific real fixtures include Rock Outcroppings, Habbanya Ridge Flat, Captain Iakin Nefud, Margot Lady Fenring and Premier Ein Calimar, Bene Gesserit, Spacing Guild, a long non-GF9 faction, Hidden Mobile Stronghold and a long custom Storm deck back label. Also cover Nexus, Homeworld, Leader Skill, Stronghold, ordinary Custom and Treachery heads so the shared route is proven rather than inferred.

Use actual loaded fonts and the same native rendering dimensions as publication. Check full text identity, one line, fit width/height, icon clearance and absence of overflow. Include scaled editor/catalogue previews, real publisher image capture and PDF placement. Retain source data equality outside the explicit restored display names. Back labels require their existing mask/paint bounds check as well as width. A screenshot should show the longest actual GF9 titles at final physical size.

Implementation needs renderer revision bumps for all affected published card families and recapture through normal authenticated publication. A fix that changes only the preview, only CardHead or only Spice is incomplete.
