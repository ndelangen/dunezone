# GF9 2.0 ruleset preparation

Working branch `norbert/gf9-2-0-ruleset` prepares [GF9 2.0 ruleset, #2431](https://github.com/ndelangen/dunezone/issues/2431). The intended result is a Dune Zone rulebook with the source wording and examples, using existing headings, icons and page-number placement. Start each faction's detailed rules on a new page, as approved in the layout review on 2026-10-23. This allows faction-section pagination and the output page count to differ from the source. Other source page boundaries remain the starting point. A separate rulebook will explain the differences from the earlier rules.

Start with the [reworked reading transcript](transcript-reworked.md). The [original working transcript](transcript.md) retains the OCR-oriented version. Then read the [transcription review](transcription-review.md) and [block audit](block-audit.md). The [differences plan](differences-plan.md) records how to prepare the second book without changing the first.

Use existing Blocks, layouts and renderer presentations by default. Do not ask for approval
for each reuse decision. Only bring forward a proposal that departs from that default, with
a concrete example of what the existing tools cannot represent. No new Block or layout
requirement is currently confirmed. Preserve the rules and check edition-specific card text.

Omit the printed table of contents from the Dune Zone book, as approved in the same review.
Use the webapp's existing left navigator. The source transcripts retain the contents for reference.

Omit source page 7's complete component-inventory page/section from the online rulebook.
The source PDF and transcripts retain it. No component collage or inventory reconstruction
is required for the online edition.

Use the existing battle wheel and battle Blocks for battle illustrations. Preserve the
source examples' selected cards, leaders, numbers and outcomes, explaining the 2.0 spice
calculation in text where needed. No source-wheel recreation or new battle capability is required.

Build page 26's force-strength illustrations with existing piece Blocks and explain the
arithmetic in text. Approximate their arrangement without adding a Block or renderer capability.

Use the existing `asset-explainer` markers and legend for page 6's board labels. This
presentation is approved as preferable to the source's boxes and long arrows. Preserve all
labels and explanations; no connector changes are required.

Use the existing Q&A Block for faction questions, with its current separate question and
answer presentation. Preserve the wording and let the renderer supply `Answer:` once.

Use the existing callout Block for the bordered Karama extracts on page 26. Keep each title
and its formatted rules text, using the current border and spacing without a new variant.

## Source

The user supplied `Dune 2026 Rulebook.pdf` on 22 October 2026 and reported that it came out the previous day. The retained [source.pdf](source.pdf) is byte-for-byte identical to that file. Its cover says `SECOND EDITION`. It has 36 image-only PDF pages, with no selectable text. Its embedded creation timestamp is 21 October 2026 at 22:02:17 CEST. That timestamp alone does not establish a publisher release date.

SHA-256:

```text
0d8a3a0bc504596199fe2fc8dcc600e6dba1c627649db057959245a42d89566a
```

PDF page positions are the source identifiers, starting at the cover as page 1. Keep apparent source mistakes, repeated contents entries and outdated printed references as printed. Record questions outside the transcript. Do not correct the original to agree with an earlier edition, an existing Dune Zone book or an interpretation of how the rule ought to work.

The source includes photographs with page curl, perspective, glare and a few clipped edges. Those are scan defects to document. Rebuilding the printed page does not require reproducing a camera shadow or paper curl. Preserve the source content and apply the approved heading and pagination adjustments above. Any further change to artwork, wording or pagination needs a recorded decision. Keep source page boundaries intact in the transcripts for comparison.

## Files

| File | Purpose |
| --- | --- |
| [source.pdf](source.pdf) | Original supplied source, unchanged. |
| [transcript-reworked.md](transcript-reworked.md) | Second visual pass, page by page. Restored sentences, paragraph order, captions and labels. Contextual reconstructions are marked where uncertain. |
| [transcript.md](transcript.md) | All 36 pages, divided into reading regions. Source text is inside fenced regions; headings outside them are working labels. |
| [page-map.json](page-map.json) | Source fingerprint, extraction settings, native image dimensions and fingerprints, page titles, candidate blocks, reading regions and stable OCR line IDs. |
| [ocr/raw](ocr/raw) | First OCR pass, language correction disabled. Coordinates and confidence retained. |
| [ocr/language-corrected](ocr/language-corrected) | Second OCR pass with English language correction and Dune terms supplied. These remain machine candidates. |
| [ocr/illustration-supplements.json](ocr/illustration-supplements.json) | Visible portrait, leader, map, setup and wheel lettering missed or fragmented by OCR. |
| [ocr/contents-transcription.json](ocr/contents-transcription.json) | Checked page-2 contents entries with the source page numbers unchanged. Dot counts approximate visual leaders. |
| [ocr/source-gaps.json](ocr/source-gaps.json) | Known damaged source observations, marked in the transcript. |
| [ocr/visual-corrections.json](ocr/visual-corrections.json) | Visually checked repairs to the second pass, retaining the original candidate and reason. An empty replacement suppresses duplicate OCR; a multiline replacement can restore readable lines missed by OCR. |
| [ocr/low-confidence.json](ocr/low-confidence.json) | Machine observations below 0.8 confidence that have no logged visual correction. A review queue, not a list of proven source errors. High confidence is not proof of accuracy. |
| [transcription-review.md](transcription-review.md) | Actual review coverage, unreadable fragments and remaining work. |
| [block-audit.md](block-audit.md) | Current contracts and rendering behavior, all 36 page compositions, missing capabilities and small adjustment proposals. |
| [differences-plan.md](differences-plan.md) | Baseline selection, comparison record and candidates for later investigation. |
| [artwork/provenance.json](artwork/provenance.json) | Sources, perspective correction, crops and tracing operations for the added 2.0 decals. Reference crops are retained beside it. |

## Added decals

The user supplied clearer card photographs and deck sheets for this artwork. Solaris combines native Stormworld and Emperor paths with traced star and portrait details. Little Maker uses traced SVG paths. Karama 2.0 adapts the existing Karama vector, using the supplied images to identify the design changes. These are additions; existing artwork remains available.

| Decal | Collection |
| --- | --- |
| [Solaris](../../media/vector/decal/solaris.svg) | Trade goods and supplies |
| [Solaris, multicolour](../../media/vector/decal/solaris-multicolor.svg) | Trade goods and supplies |
| [Little Maker](../../media/vector/decal/little-maker.svg) | Animals and desert fauna |
| [Little Maker, multicolour](../../media/vector/decal/little-maker-multicolor.svg) | Animals and desert fauna |
| [Karama 2.0](../../media/vector/decal/karama-2-0.svg) | Symbols and markings |
| [Dune ridgelines](../../media/vector/decal/dune-ridgelines.svg) | Weather and natural hazards |

The monochrome decals inherit their chosen colour and have transparent cutouts. Solaris has a gold palette variant. Little Maker also has a fixed palette variant with pale water, an olive engraved band and dark ink. Karama uses the original vector's glyph contours and geometric construction, adapted to the 2.0 design, while omitting the card's faint background guides. Sources and transformations are recorded in the [provenance file](artwork/provenance.json). The [artwork review](artwork/review.md) records the inferred construction and design changes. The [Karama card draft](cards/README.md) uses the approved full decal. These files do not create application records.

## Extraction and review

Poppler `pdftotext -layout` produced no words. `pdfimages -j` extracted one native JPEG per page without resampling. Apple Vision recognized the full-resolution images using accurate English recognition. Both OCR passes are retained because language correction can change a proper noun or invent a plausible word.

The transcript uses the second pass plus logged visual corrections. The page map groups observations into columns, sidebars, phase bands and illustration regions. Each original observation has a stable ID such as `p17-l018`. Its array index is zero-based; its PDF page is one-based. Coordinates use the bottom-left image origin and values between 0 and 1.

The review covers all 36 source page images, including captions and component lettering. Readable omissions found during visual review have been added to the correction log. Unreadable scan fragments remain in the review notes. Neither an OCR confidence score nor a visual pass certifies the transcript as exact. The next authoring pass must resolve the listed fragments from a clearer copy or leave them explicitly unresolved.

Retain the line breaks for checking against the photograph. Paragraph joins, emphasis and literal punctuation must be checked when transferring text into Dune Zone's formatted-text fields. Do not treat Markdown or the source's hyphens and asterisks as ready-to-import formatting syntax.

## Reconstruction work

The [audit](block-audit.md#page-by-page-composition-plan) maps every source page. Most content can use existing text, list, illustration, card, callout and heading blocks. The page-design review approved existing headings, icons and page-number placement, so a separate page design is not required. Compound page arrangements and artwork sources remain to review. The printed contents are omitted. Page 26's force arithmetic uses existing piece Blocks and explanatory text. Neither originally proposed new Block is required.

Record decisions in the separate block comments on [#2431](https://github.com/ndelangen/dunezone/issues/2431). Test the remaining compositions with existing tools, including page 26's force arithmetic. Page 7's component inventory is omitted online. Compare every rendered page with its source and the approved presentation changes, and check the exported PDF, text selection, reading order, images and overflow.

This branch contains preparation documents, source evidence and added decals with catalogue registration. It does not create an importable book, change the renderer's behavior or create or publish application records. Existing [GF9 content](../gf9/README.md) and its authoring files remain the earlier edition's work. Do not regenerate or replace them from this transcript.

## Verification of this preparation

The retained PDF matches the supplied file's SHA-256. The page map contains exactly pages 1 through 36, 36 raw/candidate OCR pairs, and each of the 3,133 observations exactly once. All 509 logged corrections match their original candidate strings. The transcript has 36 page anchors and balanced text fences, and its local document links resolve.

Known scan damage has 128 explicit observation markers in the transcript, plus the unreadable line in the page-2 quotation. The 181 remaining low-confidence candidates are a separate review queue. These counts do not include every miniature illustration label or imply that unmarked text is certified.

The source-preparation checks passed with `vp fmt --check content/gf9-2-0`, `bun scripts/assert-no-ai-tells.ts` and `git diff --check`. Source-integrity and document-link checks passed in a file-only validation pass.

For the added decals, vector generation and validation passed. Media catalogue tests passed with 9 tests, and AssetSelect Storybook tests passed with 8 tests. The publisher build and HTML runtime verification passed. Visual checks covered recolouring, transparent cutouts and picker availability, including the existing and new Karama artwork together.
