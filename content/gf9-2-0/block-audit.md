# GF9 2.0 rulebook block audit

This audit prepares a faithful Dune Zone reconstruction of the supplied 36-page
[source PDF](source.pdf). Page numbers below mean PDF page positions, with the cover as
page 1. The [transcript](transcript.md) records an OCR draft with visual corrections and unresolved scan gaps. The PDF remains the authority. This file contains planning
notes, not replacement wording or an importable Rulebook.

The target is one Dune Zone Page for each source page, in the same order, with the same words,
examples, captions and printed references. Source mistakes and awkward continuations stay in
the transcription. Proposed software adjustments below do not authorize editing the rules or
changing their page breaks. A separate differences book can explain changes later.

The page-design review on 2026-10-23 approved using the existing heading, icon and
page-number placement. Simplify the source phase bands to the normal heading presentation.
Preserve the phase number and title as heading text. A separate page design is not required.

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
| Examples, notes and quotations | `callout` | There are `note`, `example` and `quotation` variants. Test the source's unboxed examples and bordered Karama extracts before selecting one. |
| Faction questions | `question-answer` | It inserts `Answer:` itself. Do not paste an additional answer label into the field. Some source answers say `Answer: No.` on the question line and need a closer presentation match. |
| Standalone artwork and captions | `referenced-illustration` | Accepts small, medium or large size and an empty caption. Its source must resolve through the source catalogue. There is no arbitrary interior image URL or crop field. |
| Faction overview bands | `faction-introduction` | Already composes a token, summary, ruler and leader roster. It also emits the faction name and `Leaders`; do not accidentally duplicate source labels or add labels absent from a particular source panel. |
| Components | `illustrated-inventory` | The current renderer produces a vertical list of image/description rows and can insert source names and `Quantity:`. Page 7 is a collage with a separate token column and shaded component panel. |
| Illustrated card explanations | `card-entry`; `card-group` | Entry supports image side, size and beside/wrapped text. Group supports compact, gallery, featured-member and fan variants. Exact GF9 card artwork remains a separate requirement. |
| Labelled component diagrams | `asset-explainer` | Has custom labels, position targets, named geometry targets and colors. It uses markers with a separate legend. Page 6 instead uses rectangular labels outside a board with long leader lines. |
| Board examples | `board-scene` | Has crop viewport, storm, troops, players, highlights, routes and positioned annotations. It references a maintained board definition; an arbitrary scan extract is not a board definition. |
| Battle examples | `battle-step`, `battle-plans`, `battle-comparison` | Store selected cards, leader, spice, forces, dial and authored explanation. Their composed diagrams must be compared with the specific GF9 wheel/card arrangements. |
| Transfers and force examples | `piece-transfer`, `piece-movement` | Can compose groups of source images and troop tokens. They do not provide the source's exact arithmetic row with plus signs and one value under each token. |
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
| 2 | `outer-rail`, `text`, headings | Preface has a narrow left note and two main columns; Contents begins below it across the main area. Need main-area band composition and dotted-leader contents entries. |
| 3 | `outer-rail`, `text`, `credits`, illustrations | Notes and Credits share a page; credits use a second arrangement below the notes. Preserve the expansion note and right-hand legal/logo material. |
| 4 | `single-column`, four `faction-introduction` blocks | Match Atreides, Bene Gesserit, Emperor and Fremen bands, token/ruler/leader sizes and colored backgrounds. Verify every displayed label and roster against this edition. |
| 5 | Two faction introductions, `section-heading`, two text columns | Guild/Harkonnen occupy the upper part, then Object of the Game begins below. Need a full-width opening with two lower columns, without an added page heading above the faction bands. |
| 6 | `asset-explainer`, `referenced-illustration`, `text` | Board dominates the upper/right area; explanatory text sits lower/left; exploded Battle Wheel art sits below. Existing marker/legend composition does not match the boxed external labels and leader lines. |
| 7 | `asset-explainer`, `card-group` fan, inventory and illustrations | Needs an upper faction-component illustration, lower deck list, narrow token column and shaded two-column faction-specific panel. Preserve the five numbered labels and printed component quantities. |
| 8 | `two-columns`, `text`, numbered `list`, bottom illustration | Setup has source margin notes and an Atreides sheet extract along the bottom. Test a rail plus bottom band, and preserve the callout labels on the extract. |
| 9 | Numbered `list` with icons, `text`, `wide-narrow` | Phase list has nine numbered icons and page references, with introductory text above. Match the first-player explanation and list indentation without inventing captions. |
| 10 | `two-columns`, `text`, `board-scene` or original map extracts | Storm examples include circular/cropped board images and exact italic captions in the right column. Use the existing heading and icon, retaining the phase number and title. Preserve the margin note. |
| 11 | `two-columns`, `text`, card entries and paired card images | Main text and example card pair coexist with a narrow illustrated right area. Source cards include printed names and rules; retain their text in the transcription and their original appearance in artwork. |
| 12 | `text`, lists and two phase headings | CHOAM Charity is a short upper section; Bidding follows in two columns. Use existing headings and icons for both phases. Review their placement and the margin note using existing layouts before proposing a layout change. |
| 13 | `text`, lists, illustrated sheet extract | Revival is two upper columns, with a large Atreides sheet and an adjacent margin explanation below. Existing paired rows are a starting point; row heights and the sheet/explanation widths need proof. |
| 14 | `two-columns`, `text`, lists, board example | Shipment and Movement includes a map extract in the upper right with caption and smaller subheadings. Use the original crop unless an exact board reconstruction passes visual review. |
| 15 | `two-columns` or `wide-narrow`, text and board scenes | No new page heading. Two smaller board examples on the left and a tall map crop on the right have captions outside the map. Preserve their bounds and the source reading order. |
| 16 | `two-columns`, `text`, lists | Battle begins with a full phase heading and a margin note. Dense subheadings and bullet spacing are the main fit risks. |
| 17 | `text`, lists, card entries, wheel illustration | Main battle text shares space with a narrow card strip and a wheel/spice example. The source wraps several explanatory notes around artwork. |
| 18 | `two-columns`, `text`, lower band of battle-plan artwork | Battle result rules sit above Example of a Battle. The lower band has one side's prose and composed cards/wheel/leader. Existing `battle-step` is useful only if its drawn diagram matches the source. |
| 19 | `two-columns`, `text`, lists, lower band of battle-plan artwork | Traitors continues above the matching second battle-plan band. Do not merge pages 18 and 19 into one teaching step or add new outcome wording. |
| 20 | Two phase headings, text, board illustration | Spice Collection and Mentat Pause each occupy part of the page. Their headings, image and two-column text require independent vertical bands. |
| 21 | `two-columns`, `text`, lists, `section-heading` | Alliances/Nexus is mainly prose. Retain exact subsection order, bold lead-ins and the source heading wording. |
| 22 | `two-columns`, `text` | Other Rules uses many small bold lead-ins and dense paragraphs. Fit must preserve all source text, including social-interaction and discarded-pile sections. |
| 23 | `two-columns`, text, card pair, card entries | Treachery Cards combines weapon/defense explanations with two illustrated weapons and a separate action-card column. Exact cards and captions must remain paired with their descriptions. |
| 24 | `two-columns`, text, map extract, card entries | Shield Wall/Family Atomics material occupies the left; faction-specific Karama bullets and the Karama card occupy the right. Preserve the nested order and map caption. |
| 25 | `two-columns`, text, card entry | Treachery-card insights are mainly short named paragraphs, plus Solaris art. Text flow beside the art is already supported by `card-entry`, but its heading/quantity defaults need care. |
| 26 | `outer-rail`, text, callouts, illustrations | The left rail has three cropped half-increment wheel windows. Main columns include arithmetic token rows and bordered Karama extracts. Current battle and transfer blocks do not exactly represent these compact diagrams. |
| 27 | `outer-rail`, section headings, text, troop illustration | Bene Gesserit has two rules columns, a strategy rail, a faction emblem and an advisor token beside prose. Preserve the source's opening sentence about the following pages as printed. |
| 28 | Text, headings, troop illustration, question/answer content | Bene Gesserit continues in the main columns with an empty left rail; a Fremen heading then spans only the main area above two lower columns. This combination is absent from the fixed layout catalogue. |
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

Keep all source wording and page boundaries, then compare a render of every page for fit.
The current [Page canvas clips overflow](../../src/game/rulebook/RulebookRenderer.css#L15)
and [print rules fix the physical page](../../src/game/rulebook/RulebookRenderer.css#L1134).
A valid Contents object does not prove that the last paragraph, caption or image survived.

### Compound page arrangements

The current grids have fixed column ratios and region sets. `outer-rail` alternates its rail
by page side, `band-columns` offers one full-width band above or below two columns, and
`paired-rows` offers an opening, two paired rows and a closing. Review the source arrangements
against these layouts before treating a visual difference as a missing capability.

Page 28 is the clearest proving page. It needs a rail spanning the page height, an upper
two-column continuation, a faction band across only the main area, and two lower columns.
Pages 2, 3, 5, 7, 12, 13 and 20 exercise related combinations. First test the existing named
layouts and review any proposed simplification. Add a layout only if a required content
arrangement remains unsupported. Keep that decision separate from the approved heading and
page-number simplification.

### Suppress generated wording when the source does not contain it

Use `text` and plain illustrations where convenience blocks would add content. An optional
presentation control for source names, quantities and repeated headings may make existing
inventory/card/faction blocks reusable. Keep every actual source label in the authored data.

Questions on pages 28, 29, 30 and 33 need a compact source-matched presentation. The existing
[question/answer renderer](../../src/game/rulebook/RulebookBlockRenderer.tsx#L337) inserts an
answer label and separates the answer from its question. Prefer a presentation adjustment
over creating another question Block. The same applies to the small bordered Karama extracts
on page 26; test a `callout` variant before adding a new kind.

### Artwork, maps and diagrams

Interior illustrations accept a
[limited set of source references](../../src/shared/rulebooks/sources.ts#L20). A local JPEG
crop is not a valid saved illustration source by itself. Catalogue it through the established
maintained-media/source mechanism or provide a reviewed image-source capability. Record
source page, crop bounds, original hash, output dimensions and any transformation. The whole
scanned page is valuable evidence, but it does not replace editable paragraphs and rules.

Exact source cards, portraits, tokens, board crops, the exploded wheel and the cover require
their own artwork inventory. Existing Dune Zone artwork is a candidate only after comparison.
The maintained [board catalogue](../../src/shared/rulebooks/boardDefinitions.ts#L17) currently
contains one Arrakis definition. Its existence does not establish that it is the board image
printed in this PDF. Replacing printed artwork with a cleaner recreation needs a separate
decision because it changes the as-is result.

For page 6, extend `asset-explainer` only if editable labels are needed. Its custom labels and
position targets already exist, but
[position markers have no independent connector endpoint](../../src/shared/rulebooks/assetExplainerAnnotations.ts#L171).
The source needs boxed external labels, separate marker/target coordinates and arrows. The
[board-scene annotation contract](../../src/shared/rulebooks/illustratedScenes.ts#L49)
already models independent label and target coordinates, so examine that shared behavior
before adding another annotation system. A faithful extracted diagram is also a viable first
representation if its labels remain transcribed and its source limits are recorded.

For maps on pages 10, 14, 15, 20 and 24, `board-scene` already has a
[viewport, routes and annotations](../../src/shared/rulebooks/illustratedScenes.ts#L96).
Test exact source crops and token positions rather than assuming a new map Block is needed.
`referenced-illustration` can carry a maintained crop when the source diagram is retained.

## Candidate new Blocks

Two candidates remain after reuse and presentation changes. Neither is implemented here.

| Candidate | Source evidence | Why an existing kind does not quite cover it | Acceptance proof |
| --- | --- | --- | --- |
| Contents entries | Page 2, two columns under Contents, dotted leaders and authored page references | `reference-table` can store the words and numbers but has a header row and fixed table presentation. `text` can preserve the text but cannot align dotted leaders reliably. A contents-specific presentation on the existing table is another option. | Reproduce both source columns, ordering, indentation, headings and printed page numbers. Links may point at stable Page/Block identities without changing visible words. |
| Compact illustrated arithmetic row | Page 26, forces with spice above and `2 + 1/2 + 1/2` or longer sums below | `piece-transfer` is a pair of groups, while battle Blocks compose plans. Neither stores one source image and authored strength per term with separators. A narrow extension to an existing illustrated-piece composition may be enough. | Reproduce the two source rows with the right force faces, spice token, source fraction glyphs and placement. No computed rule result or replacement explanation. |

The component collage on page 7 does not automatically justify a new inventory Block. First
test a page arrangement that places existing inventory/card/illustration blocks in the needed
regions. The printed faction sheets on pages 27-33 likewise need source-faithful composition,
not the generated roster behavior of `faction-introduction`.

## Separate issue comment groups

Keep these findings as separate comments on
[GF9 2.0 ruleset, #2431](https://github.com/ndelangen/dunezone/issues/2431), so implementation
decisions and evidence can accumulate independently.

1. **Compound layouts to review.** Source pages 2, 3, 5, 7, 12, 13, 20 and especially
   28. Review the main-area/rail arrangements against the existing nine layouts. The page-design
   review approved existing headings, icons and page-number placement; those require no new
   capability. Demonstrate a content arrangement that existing layouts cannot express before
   proposing a layout addition.
2. **Interior artwork sources and labelled diagrams.** Source pages 1, 4-7, 10-15, 17-19,
   23-27 and 29-33. Track exact artwork/crop inventory and durable source references. Page 6
   tests an `asset-explainer` label/connector adjustment; map pages test existing viewport and
   annotation support.
3. **Contents Block or table presentation.** Page 2. Track dotted leaders, nested labels,
   exact printed page numbers and optional invisible link behavior.
4. **Compact force arithmetic illustration.** Page 26. Track whether an existing piece
   Block can gain a narrow presentation or a new kind is needed. Keep the three wheel-window
   extracts as artwork unless an exact live rendering is proved.
5. **Source-exact labels and compact explanations.** Pages 4-7, 11, 17-19 and 23-33. Track
   suppression of automatic `Quantity:`, source names and repeated labels, source-matched Q&A,
   and the small bordered Karama extracts. Prefer adjustments to existing Blocks.

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

Publishable proof must include the rendered HTML and final PDF, with 36 Pages, the intended
physical dimensions, no clipped text, resolved images and correct printed references. The
existing [PDF capture contract](../../docs/technical/rulebook-pdf-capture.md) handles complete
documents up to 100 Pages, so the source page count itself needs no new publication feature.
No Dune Zone content records, renderer code or production data were changed for this audit.
