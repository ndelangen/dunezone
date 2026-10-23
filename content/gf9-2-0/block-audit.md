# GF9 2.0 rulebook block audit

This audit prepares a faithful Dune Zone reconstruction of the supplied 36-page
[source PDF](source.pdf). Page numbers below mean PDF page positions, with the cover as
page 1. The [transcript](transcript.md) records an OCR draft with visual corrections and unresolved scan gaps. The PDF remains the authority. This file contains planning
notes, not replacement wording or an importable Rulebook.

## Review policy

Using existing Blocks, layouts, artwork and renderer presentations is the default. Do not
ask for approval item by item when the proposal is reuse. Only present an item when the
proposal departs from that default, supported by a concrete example of what cannot be
represented. Source appearance differences alone do not establish a missing capability.
Preserve the rules, example values and source wording, subject to the recorded decisions
below. Reuse does not authorize substituting an older card's different rules text.

No new Block or layout requirement is confirmed by this review. Test remaining compositions
with the existing tools before proposing an exception.

The target is one Dune Zone Page for each source page, in the same order, with the same words,
examples, captions and printed references. Source mistakes and awkward continuations stay in
the transcription. Proposed software adjustments below do not authorize editing the rules or
changing their page breaks, except for the approved pagination and omissions below.
A separate differences book can explain rules changes later.

The page-design review on 2026-10-23 approved using the existing heading, icon and
page-number placement. Simplify the source phase bands to the normal heading presentation.
Preserve the phase number and title as heading text. A separate page design is not required.

The same review approved starting each faction's detailed rules on a new page. Finish the
Bene Gesserit continuation before starting Fremen. This removes the mixed-faction arrangement
on source page 28 from the layout requirements. Preserve the source text and its order, while
allowing faction-section page breaks and the resulting output page count to change. The
transcripts and source-page identifiers remain unchanged.

The review also approved omitting the printed table of contents from the Dune Zone book.
Use the webapp's existing left navigator. Keep the contents in the source transcripts for
reference. No contents Block, table presentation or printed-contents page-number work is needed.

For page 26's force arithmetic, the review approved using existing piece Blocks and text.
Approximate the token arrangements with existing group labels and piece labels, then explain
the strength arithmetic in adjacent text. No arithmetic Block or renderer extension is required.
Keep source prose in order; the added explanation must preserve the example's mechanics.

For page 6's board labels, the review approved the existing `asset-explainer` presentation
as preferable to the source arrangement. Use its markers and legend, preserving all labels
and explanations. No external label boxes, leader-line reproduction or connector extension
is required.

For the faction questions, use the existing `question-answer` Block. The review approved
its separate question and answer presentation. Preserve the wording and let the renderer
supply `Answer:` once. No compact variant or Q&A presentation change is required.

Use the existing `callout` Block for page 26's bordered Karama extracts. Preserve each title
and its formatted rules text. Use the existing border and spacing; surrounding explanation
stays in ordinary text Blocks. No new callout variant or renderer change is required.

Omit source page 7's complete component-inventory section from the online rulebook, as
approved in the review. It inventories the physical box contents. This removes its collage,
deck inventory, token inventory and faction-specific component panel from online authoring.
Keep the page in the source PDF and transcripts. No inventory layout or Block work is needed
for this omitted section.

Use the existing battle wheel and battle Blocks for battle illustrations, as approved in
the review. Preserve the source examples' selected cards, leaders, numbers and outcomes.
Use text to explain the 2.0 spice calculation where the current presentation differs.
No source-wheel recreation, new battle Block or renderer extension is required.

## What exists today

The [Contents contract](../../src/shared/rulebooks/contents.ts#L59) has 19 Block kinds and
[nine fixed Page layouts](../../src/shared/rulebooks/contents.ts#L456). The
[settings contract](../../src/shared/rulebooks/settings.ts#L4) includes a 254 mm square
`gf9-core` size. Its two designs are `illustrated` and `restrained`. Use the existing page
styling and heading treatment under the approved simplification.

| Source material | Existing Block or control | What to check before using it |
| --- | --- | --- |
| Body paragraphs and short bold lead-ins | `text`; optional `name` | Preserve the actual paragraphs and emphasis. A `name` renders an added heading, so only use it for an existing source heading. |
| Rules, exceptions and setup steps | `list`, with bulleted or numbered style and a starting number | Supports named items and icons. Nested prose lists also exist in formatted text. Check the source's marker shape, indentation and continuation. |
| Section and faction bands | `section-heading`; optional faction reference | Use the existing heading and icon presentation. Preserve phase numbers and titles in the heading text. Source band styling and a separate subtitle field are not requirements. |
| Examples, notes and quotations | `callout` | Use the existing variants. Page 26's bordered Karama extracts are approved for the existing callout presentation, including its border and spacing. No new variant is required. |
| Faction questions | `question-answer` | Use the existing separate question and answer presentation as approved. It inserts `Answer:` itself; do not paste an additional answer label into the field. No compact variant is required. |
| Standalone artwork and captions | `referenced-illustration` | Accepts small, medium or large size and an empty caption. Its source must resolve through the source catalogue. There is no arbitrary interior image URL or crop field. |
| Faction overview bands | `faction-introduction` | Already composes a token, summary, ruler and leader roster. It also emits the faction name and `Leaders`; do not accidentally duplicate source labels or add labels absent from a particular source panel. |
| Components | `illustrated-inventory` | The current renderer produces a vertical list of image/description rows and can insert source names and `Quantity:`. Page 7 is a collage with a separate token column and shaded component panel. |
| Illustrated card explanations | `card-entry`; `card-group` | Entry supports image side, size and beside/wrapped text. Group supports compact, gallery, featured-member and fan variants. Exact GF9 card artwork remains a separate requirement. |
| Labelled component diagrams | `asset-explainer` | Use existing markers and the separate legend. This presentation is approved for page 6 in place of its boxed external labels and long arrows. Preserve every label and explanation. |
| Board examples | `board-scene` | Has crop viewport, storm, troops, players, highlights, routes and positioned annotations. It references a maintained board definition; an arbitrary scan extract is not a board definition. |
| Battle examples | `battle-step`, `battle-plans`, `battle-comparison` | Use existing battle Blocks and the existing wheel as approved. Preserve selected cards, leaders, forces, spice, strength and outcomes. Explain the 2.0 calculation in text; the source wheel/card arrangement is not required. |
| Transfers and force examples | `piece-transfer`, `piece-movement`, `text` | Use existing piece groups and labels to approximate the source illustrations. Explain individual strengths and totals in text. Exact per-token arithmetic placement is not required. |
| Credits | `credits`, plus text and illustrations | Supports groups, names and roles. Legal paragraphs and the publisher/studio logos still need their own content. |
| Tables | `reference-table` | Stores authored headings and formatted cells. It has no dotted-leader contents presentation, column spanning or diagram cells. |
| Front cover | `cover` Page with background image | Can use a supplied image and hide the generated title, Dune logo and subtitle. Retain the source's baked-in logos and words without drawing a second copy over them. |

The relevant rendering behavior is visible in
[RulebookBlockRenderer](../../src/game/rulebook/RulebookBlockRenderer.tsx#L232), not only in
the schema. In particular, `Quantity:` appears in
[card guides](../../src/game/rulebook/RulebookBlockRenderer.tsx#L214) and
[inventory rows](../../src/game/rulebook/RulebookBlockRenderer.tsx#L389), and text references
append a [generated `See` sentence](../../src/game/rulebook/RulebookBlockRenderer.tsx#L249).
These conveniences must not add words to the as-is edition.

Formatted text supports paragraphs, line breaks, lists, bold, italic and underline. Its
[node contract](../../src/shared/formattedText.ts#L25) has no inline image, font-size,
per-span color or arbitrary positioned text. Treat the transcript as transcription input,
not formatted-text markup. Import must escape or encode literal characters according to
the parser and retain the source wording.

## Page-by-page composition plan

These are starting compositions. A named existing layout means it is the closest available
arrangement, not that an exact fit has been proved. The page scans include perspective,
page curl, glare and gutter shadows. Keep those source limitations separate from the flat
printed layout being reconstructed.

| Page | Existing material to reuse | Fidelity work or missing capability |
| --- | --- | --- |
| 1 | `cover`, source background image | Use the original cover. Disable generated title/logo/subtitle. Check full-page fit, cropping and the source's publisher logos. |
| 2 | `outer-rail`, `text`, headings | Retain the preface and margin quotation. Omit the printed Contents section; navigation uses the existing left navigator. No contents band or entries are required. |
| 3 | `outer-rail`, `text`, `credits`, illustrations | Notes and Credits share a page; credits use a second arrangement below the notes. Preserve the expansion note and right-hand legal/logo material. |
| 4 | `single-column`, four `faction-introduction` blocks | Match Atreides, Bene Gesserit, Emperor and Fremen bands, token/ruler/leader sizes and colored backgrounds. Verify every displayed label and roster against this edition. |
| 5 | Two faction introductions, `section-heading`, two text columns | Guild/Harkonnen occupy the upper part, then Object of the Game begins below. Need a full-width opening with two lower columns, without an added page heading above the faction bands. |
| 6 | `asset-explainer`, existing battle wheel, `text` | Use the existing markers and legend for board labels. Preserve labels and explanatory prose. Use the existing battle wheel presentation with the assembly explanation in text. No annotation or wheel capability change is required. |
| 7 | Omitted from the online rulebook | Drop the complete component-inventory page/section as approved. Retain it in the source PDF and transcripts. No collage, deck/token inventory or faction-specific component panel is required online. |
| 8 | `two-columns`, `text`, numbered `list`, bottom illustration | Setup has source margin notes and an Atreides sheet extract along the bottom. Test a rail plus bottom band, and preserve the callout labels on the extract. |
| 9 | Numbered `list` with icons, `text`, `wide-narrow` | Phase list has nine numbered icons and page references, with introductory text above. Match the first-player explanation and list indentation without inventing captions. |
| 10 | `two-columns`, `text`, `board-scene` or original map extracts | Storm examples include circular/cropped board images and exact italic captions in the right column. Use the existing heading and icon, retaining the phase number and title. Preserve the margin note. |
| 11 | `two-columns`, `text`, card entries and paired card images | Main text and example card pair coexist with a narrow illustrated right area. Source cards include printed names and rules; retain their text in the transcription and their original appearance in artwork. |
| 12 | `text`, lists and two phase headings | CHOAM Charity is a short upper section; Bidding follows in two columns. Use existing headings and icons for both phases. Review their placement and the margin note using existing layouts before proposing a layout change. |
| 13 | `text`, lists, illustrated sheet extract | Revival is two upper columns, with a large Atreides sheet and an adjacent margin explanation below. Existing paired rows are a starting point; row heights and the sheet/explanation widths need proof. |
| 14 | `two-columns`, `text`, lists, `board-scene` | Use the existing board and scene presentation. Preserve the locations, annotations and explanation; the source crop and artwork style do not need to be matched. |
| 15 | `two-columns` or `wide-narrow`, text and board scenes | No new page heading. Two smaller board examples on the left and a tall map crop on the right have captions outside the map. Preserve their bounds and the source reading order. |
| 16 | `two-columns`, `text`, lists | Battle begins with a full phase heading and a margin note. Dense subheadings and bullet spacing are the main fit risks. |
| 17 | `text`, lists, card entries, wheel illustration | Main battle text shares space with a narrow card strip and a wheel/spice example. The source wraps several explanatory notes around artwork. |
| 18 | `two-columns`, `text`, existing battle Blocks | Battle result rules sit above Example of a Battle. Use the existing battle wheel and battle Blocks. Preserve the Emperor's chosen cards and leader, 6 force strength, 4 spice for +2 strength, and the explained total. No exact source-diagram recreation is required. |
| 19 | `two-columns`, `text`, lists, lower band of battle-plan artwork | Traitors continues above the matching second battle-plan band. Do not merge pages 18 and 19 into one teaching step or add new outcome wording. |
| 20 | Two phase headings, text, board illustration | Spice Collection and Mentat Pause each occupy part of the page. Their headings, image and two-column text require independent vertical bands. |
| 21 | `two-columns`, `text`, lists, `section-heading` | Alliances/Nexus is mainly prose. Retain exact subsection order, bold lead-ins and the source heading wording. |
| 22 | `two-columns`, `text` | Other Rules uses many small bold lead-ins and dense paragraphs. Fit must preserve all source text, including social-interaction and discarded-pile sections. |
| 23 | `two-columns`, text, card pair, card entries | Treachery Cards combines weapon/defense explanations with two illustrated weapons and a separate action-card column. Exact cards and captions must remain paired with their descriptions. |
| 24 | `two-columns`, text, map extract, card entries | Shield Wall/Family Atomics material occupies the left; faction-specific Karama bullets and the Karama card occupy the right. Preserve the nested order and map caption. |
| 25 | `two-columns`, text, card entry | Treachery-card insights are mainly short named paragraphs, plus Solaris art. Text flow beside the art is already supported by `card-entry`, but its heading/quantity defaults need care. |
| 26 | `outer-rail`, text, existing wheel, callouts, `piece-transfer` | Use existing piece groups for force examples and explain the arithmetic in text. Use the existing battle wheel for half-increment illustrations and existing callouts for Karama extracts. No new arithmetic, wheel or callout capability is required. |
| 27 | `outer-rail`, section headings, text, troop illustration | Bene Gesserit has two rules columns, a strategy rail, a faction emblem and an advisor token beside prose. Preserve the source's opening sentence about the following pages as printed. |
| 28 | Existing column/rail layouts, text, headings, troop illustration, question/answer content | Complete Bene Gesserit first, then start Fremen on a new output page. The approved faction page break removes the need to reproduce the mixed-faction arrangement. |
| 29 | `outer-rail`, text, headings, troop illustrations | Fremen continuation uses two rules columns and a right strategy rail. Preserve special victory, alliance, insights and token labels in their original positions. |
| 30 | `outer-rail`, text, headings, troop illustrations | Emperor uses a left strategy rail and two main columns, with two force tokens at the bottom of the first main column. Use existing heading styling. |
| 31 | `outer-rail`, text, headings | Atreides uses a right strategy rail; a small source illustration appears at the lower edge. Preserve the source's intentional open space. |
| 32 | `outer-rail`, text, headings | Harkonnen uses a left strategy rail and two main columns. Test dense lists and source subheadings without generating a roster panel. |
| 33 | `outer-rail`, text, headings | Guild uses a right strategy rail, two main columns and several colored section bands. Its special victory condition and alliance text remain separate. |
| 34 | `two-columns`, text | Dune Synopsis starts here. Keep every paragraph and the page boundary; the synopsis is part of the requested book. |
| 35 | `two-columns`, text | Synopsis continues without a repeated title. `showHeading: false` supports that behavior. Keep the source's paragraph continuation. |
| 36 | `outer-rail`, text | Terminology has a narrow left note and two main definition columns. Bold term lead-ins fit existing formatted text; no table or new glossary Block is required for this page. |

## Adjust the existing tools first

### Use the existing page design

Use the normal [heading with its existing icon support](../../src/game/rulebook/RulebookInteriorHeading.tsx#L4).
Keep the phase number and title in the heading text. The source's two-line phase bands and
icons at both ends can be simplified to that presentation. Keep the implemented page-number
placement and existing typography and page styling. The page-design review on 2026-10-23
removed the proposed separate design and heading changes from the requirements.

Keep all source wording and apply the approved faction page breaks, then compare every rendered page for fit.
The current [Page canvas clips overflow](../../src/game/rulebook/RulebookRenderer.css#L15)
and [print rules fix the physical page](../../src/game/rulebook/RulebookRenderer.css#L1134).
A valid Contents object does not prove that the last paragraph, caption or image survived.

### Compound page arrangements

The current grids have fixed column ratios and region sets. `outer-rail` alternates its rail
by page side, `band-columns` offers one full-width band above or below two columns, and
`paired-rows` offers an opening, two paired rows and a closing. Review the source arrangements
against these layouts before treating a visual difference as a missing capability.

Source page 28 no longer requires a compound layout. Start Fremen on a new page after the
Bene Gesserit continuation, using existing column/rail layouts for each faction.
Omitting the contents also removes page 2's lower band; use `outer-rail` for its preface and quotation.
Page 7's complete inventory section is omitted from the online rulebook.
Pages 3, 5, 12, 13 and 20 remain composition candidates. First test the existing named
layouts and review any proposed simplification. Add a layout only if a required content
arrangement remains unsupported. Keep that decision separate from the approved heading and
page-number simplification.

### Avoid duplicate labels through authoring

Use existing Blocks and their labels. Avoid duplicating a generated label in authored fields.
Use existing text and illustration Blocks when that composition better preserves the source
wording. No label-suppression control is required without a demonstrated content problem.

Use the existing [question/answer renderer](../../src/game/rulebook/RulebookBlockRenderer.tsx#L337)
for questions on pages 28, 29, 30 and 33. Its separate question and answer presentation is
approved. Keep the source wording, supply only the answer body in the answer field, and let
the renderer add `Answer:` once. No Q&A variant or renderer change is required.

For the bordered Karama extracts on page 26, use the existing `callout` Block as approved.
Put each source heading in its title and preserve the formatted rules text in its body.
Use the current border and spacing; keep the surrounding explanation in text Blocks.

### Artwork, maps and diagrams

Interior illustrations accept a
[limited set of source references](../../src/shared/rulebooks/sources.ts#L20). A local JPEG
crop is not a valid saved illustration source by itself. Catalogue it through the established
maintained-media/source mechanism. Record
source page, crop bounds, original hash, output dimensions and any transformation. The whole
scanned page is valuable evidence, but it does not replace editable paragraphs and rules.

Use existing Dune Zone artwork by default, checking that each asset represents the intended
component and preserves the example's meaning. Edition-specific card text still needs to
match the 2.0 source. Record genuinely missing content separately from renderer capabilities.
Use the maintained [board catalogue](../../src/shared/rulebooks/boardDefinitions.ts#L17)
for map examples; matching the source's printed board style is not required.

For page 6, use the existing `asset-explainer` markers, position targets and legend.
The review approved this presentation as better than the source's external boxes and long
arrows. Match each marker to the correct board feature and preserve every label and explanation.
No annotation extension or second annotation system is required. The board image still needs
a valid source reference. Use the existing battle wheel, with the assembly explanation in text.

For battle examples on pages 17-19 and the half-increment examples on page 26, use the
existing battle wheel and Blocks. Explain the 2.0 force/spice calculation in text. Check the
selected cards, leaders, quantities and outcomes against the source, including card text
that may differ between editions. The source wheel artwork and exact card arrangement do
not need to be reproduced.

For maps on pages 10, 14, 15, 20 and 24, use the existing `board-scene` and its
[viewport, routes and annotations](../../src/shared/rulebooks/illustratedScenes.ts#L96).
Preserve the source locations, routes, forces and explanations using existing board artwork
and annotation styling. No source-scan match or new map capability is proposed.

## Candidate new Blocks

Neither proposed new Block remains required. Contents entries are omitted in favor of the
existing left navigator. The force arithmetic uses existing piece Blocks with explanatory text.

For each page-26 loss option, start with `piece-transfer` and `direction: 'none'`. Use the left
group for the full-strength loss and the right group for the half-strength losses. Existing
piece/group labels identify the groups without drawing a transfer arrow.

- First option: one supported Sardaukar contributes strength 2; two unsupported ordinary forces
  contribute 1/2 each. Explain `2 + 1/2 + 1/2 = 3` in adjacent text.
- Second option: one supported ordinary force contributes strength 1; four unsupported ordinary
  forces contribute 1/2 each. Explain `1 + 1/2 + 1/2 + 1/2 + 1/2 = 3` in adjacent text.

Include the one spice in the supported group using the existing source-piece capability if
it remains readable. Use text if its exact overlapping position cannot be reproduced. Check
that both diagrams distinguish the force types, show the correct counts and explain the same
strength-3 loss requirement as the source. Exact plus-sign placement is not an acceptance condition.

The component inventory on page 7 is omitted from the online rulebook and needs no Block
or layout work. The printed faction sheets on pages 27-33 still need source-faithful composition,
not the generated roster behavior of `faction-introduction`.

## Separate issue comment groups

Keep these findings as separate comments on
[GF9 2.0 ruleset, #2431](https://github.com/ndelangen/dunezone/issues/2431), so implementation
decisions and evidence can accumulate independently.

1. **Compound layouts to review.** Source pages 3, 5, 12, 13 and 20.
   Page 7's component inventory is omitted from the online rulebook.
   Starting each faction on a new page removes source page 28's mixed-faction arrangement
   from the requirements. Review the other arrangements against the existing nine layouts. The page-design
   review approved existing headings, icons and page-number placement; those require no new
   capability. Demonstrate a content arrangement that existing layouts cannot express before
   proposing a layout addition.
2. **Interior artwork sources and labelled diagrams.** Source pages 1, 4-6, 10-15, 17-19,
   23-27 and 29-33. Track artwork/crop inventory and durable source references. Page 6 uses
   the approved existing `asset-explainer` markers and legend, with no connector changes.
   Map pages test existing viewport and annotation support.
3. **Contents omitted.** Closed by the review decision. Use the existing left navigator;
   retain the printed contents only in the source transcripts.
4. **Force arithmetic with existing Blocks.** Page 26. Use existing piece groups and labels,
   get the illustrations as close as those tools allow, and explain strength values and totals
   in text. No new Block or extension. The wheel-window examples use the existing battle wheel.
5. **Source-exact labels and compact explanations.** Pages 4-6, 11, 17-19 and 23-33. Track
   suppression of automatic `Quantity:`, source names and repeated labels. Q&A and the Karama
   extracts are settled: use the existing Q&A and callout Blocks without presentation changes.
   The complete page-7 inventory is omitted online; it needs no inventory controls or labels.

## Later differences book

Start comparison only after the transcription has been checked against all 36 source images.
The [existing GF9 content](../gf9/README.md) explicitly covers the 2019 Basic/Advanced game,
expansions and adopted interpretations. It is a useful Dune Zone baseline, but it is not a
verbatim previous-edition transcript. Record the exact baseline source and edition for each
comparison. Keep a change in official wording separate from a change relative to an adopted
Dune Zone interpretation.

For each eventual difference, record the new page and paragraph, the old source/page and
wording, whether the change affects play or only wording, its expansion interactions, and
open questions. Candidate research areas visible in this source include spice strength,
classic spice dialing, faction advantages, Spirit World Karama, the phase sequence,
alliances/victory and the new terminology. These are investigation categories, not findings
that the rules changed.

The differences book can reuse headings, text, lists, question/answer and reference tables.
Add stable links to the as-is edition only after its Page and Block identities exist. Do not
insert change notes into the source-faithful book or rewrite the old GF9 manuscripts while
preparing this one.

## Completion evidence for reconstruction

Reconstruction is complete when all 36 source pages have reviewed editable text, every
illustration has a source record, and each rendered Page has been compared with its source.
Compare the cover, dense prose, cards, map crops, page 26 diagrams and faction continuations
at readable scale. Check text selection and reading order separately from appearance.

Publishable proof must include the rendered HTML and final PDF, all content from the 36 source
pages except the approved omissions, including the printed contents and online component
inventory, the approved faction page breaks, the intended
physical dimensions, no clipped text, resolved images and correct printed references. The
existing [PDF capture contract](../../docs/technical/rulebook-pdf-capture.md) handles complete
documents up to 100 Pages, so the source page count itself needs no new publication feature.
No Dune Zone content records, renderer code or production data were changed for this audit.
