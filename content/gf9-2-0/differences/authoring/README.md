# Local differences rulebook

The first review draft has 37 Square pages using the existing restrained design and existing Rulebook Blocks. It compares GF9 2019 Basic and Advanced with the 2026 default game for players who already know GF9.

[Open the local review](http://127.0.0.1:4320/). The preview server must be running in this checkout. It reads production artwork and writes no application data.

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
| [rulebook.json](rulebook.json) | Validated raw JSON Load document, ready for a future new Rulebook's editor. |
| [render-document.json](render-document.json) | Resolved local renderer input using existing production references. |
| [pages.json](pages.json) | Physical page number, chapter key and stable page ID. |
| [coverage.json](coverage.json) | Every research record's location or explicit unchanged-rule exclusion. |
| [render-checks.json](render-checks.json) | Whole-book browser image, geometry and runtime checks. |
| [pdf-checks.json](pdf-checks.json) | Printed page count and extracted prose-boundary checks. |
| [review.json](review.json) | Review identity, hashes, coverage counts and measured limitations. |

The review PDF is generated locally at `output/pdf/gf9-2019-to-2-0-differences-review.pdf` from the existing renderer. It is not the production publisher's artifact and has not been uploaded. The native printed size is 255.1 by 254 mm.

## Build and preview

From the repository root:

```sh
bun content/gf9-2-0/differences/authoring/build.ts
bun content/gf9-2-0/differences/authoring/preview-server.ts
```

The source uses plain strings. The builder escapes the application's formatted-text delimiters and validates the result. Keep source copy in `manuscript.json`; rebuilding replaces the raw and rendered JSON. The builder refuses unaccounted research records and validates all production references. It never creates, saves, imports or publishes an application record.

After editing, inspect the actual native rendering and update the review evidence. Check the printed copy too when regenerating the PDF. A schema pass or a complete coverage map does not certify every explanation.

## Coverage and review

All 141 research records are accounted for: 135 have a location in the book and six are explicitly omitted because they are already clarified or unchanged. Those counts include overlapping findings and questions; they are not a count of distinct mechanical changes.

The final browser check found 37 pages, no runtime errors, no missing images and no vertical content overflow. The existing rotated wheel pair reports two pixels of container scroll width; both wheels and captions were visually checked within the page. No game-renderer CSS changed.

The tagged PDF has 37 uniform Square pages. All checked prose field boundaries survive extraction in raw content order. Layout-mode extraction interleaves the two columns and is unsuitable for that check. The whole-book contact sheet and the rendered PDF battle and Bene Gesserit pages were inspected visually.

Confirmed differences are distinguished from old FAQ clarifications and Dune Zone judgements. Open wording and incomplete expansion announcements remain labeled. Review the underlying [dossier](../README.md) when a source question needs more detail. Publication is a later operation after review.
