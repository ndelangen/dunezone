# GF9 edition differences rulebook

The published book has 37 A4 pages using the existing restrained design and existing Rulebook Blocks. It compares GF9 2019 Basic and Advanced with the 2026 default game for players who already know GF9.

[Read the published book](https://dune.zone/rulesets/gf9-2-0/rulebooks/gf9-2019-to-2-0-what-changes). Edition 2 contains all 37 pages, published as Central under GF9 2.0. HTML and PDF are ready. [Publication record](publication.json).

[Open the local preview](http://127.0.0.1:4320/). The preview server must be running in this checkout. It reads existing production artwork and the approved production cover and writes no application data.

## Review contents

- Pages 2-22 cover shared changes, examples, cards, victory and rosters.
- Pages 23-30 cover all six base factions. Each faction starts on a new page.
- Page 31 compares Classic Spice Dialing and Spirit World.
- Pages 32-34 separate announced expansion changes from missing complete procedures.
- Pages 35-36 collect unresolved source wording.
- Page 37 records sources and review boundaries.

This is a teaching draft, not a copy of the research prose. It uses the existing cards, battle wheels, board scenes, leader portraits, tables, callouts and Q&A. Original game explanation is included only where it makes a changed procedure understandable.

## Files

| File | Purpose |
| --- | --- |
| [manuscript.json](manuscript.json) | Editable source with page order, authored copy, visual references and research IDs. |
| [rulebook.json](rulebook.json) | Validated raw JSON Load document with the stored production cover reference. |
| [render-document.json](render-document.json) | Resolved local renderer input using existing production references. |
| [pages.json](pages.json) | Physical page number, chapter key and stable page ID. |
| [coverage.json](coverage.json) | Every research record's location or explicit unchanged-rule exclusion. |
| [render-checks.json](render-checks.json) | Whole-book browser image, geometry and runtime checks. |
| [pdf-checks.json](pdf-checks.json) | Printed page count and extracted prose-boundary checks. |
| [review.json](review.json) | Review identity, hashes, coverage counts and measured limitations. |

The production PDF is copied to `output/pdf/gf9-2019-to-2-0-differences-review.pdf`. It has 37 tagged A4 pages. The publisher PDF and HTML URLs are recorded in `publication.json`.

## Build and preview

From the repository root:

```sh
bun content/gf9-2-0/differences/authoring/prepare-cover.ts
bun content/gf9-2-0/differences/authoring/build.ts
bun content/gf9-2-0/differences/authoring/preview-server.ts
```

The source uses plain strings. The builder escapes the application's formatted-text delimiters and validates the result. Keep source copy in `manuscript.json`; rebuilding replaces the raw and rendered JSON. The builder refuses unaccounted research records and validates all production references. It never creates, saves, imports or publishes an application record.

After editing, inspect the actual native rendering and update the review evidence. Check the printed copy too when regenerating the PDF. A schema pass or a complete coverage map does not certify every explanation.

## Coverage and review

All 141 research records are accounted for: 135 have a location in the book and six are explicitly omitted because they are already clarified or unchanged. Those counts include overlapping findings and questions; they are not a count of distinct mechanical changes.

The final browser check found 37 pages, no runtime errors, no missing images and no vertical content overflow. No horizontal content overflow was measured at A4. No game-renderer CSS changed.

The tagged PDF has 37 uniform A4 pages. All checked prose field boundaries survive extraction in raw content order. Layout-mode extraction interleaves the two columns and is unsuitable for that check. The original local layout was inspected through a whole-book contact sheet. The published PDF cover was checked visually and the authored prose boundaries were checked against the production PDF.

Confirmed differences are distinguished from old FAQ clarifications and Dune Zone judgements. Open wording and incomplete expansion announcements remain labeled. Review the underlying [dossier](../README.md) when a source question needs more detail. The publication used the normal authenticated application flow. No administrative mutations were used.

## Approved cover

`cover.png` is the approved blend of the existing 2019 and 2.0 artwork. `cover.jpg` is its JPEG delivery copy. The prompt, source URLs and local delivery path are in `cover.json`. The standard full-page cover renderer crops the original image to A4 and overlays the logo and title. `prepare-cover.ts` encodes its JPEG delivery copy without adding framing.

The approved cover was ingested through the normal Save flow from its pinned GitHub source. The stored production image is recorded in `cover.json` and used by the builder. The local delivery copy remains available for fallback.
