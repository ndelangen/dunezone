# GF9 page composition prototype

This throwaway prototype supports [Approve original-format GF9 teaching page compositions](https://github.com/ndelangen/dunezone/issues/2361). The decision is pending the user's visual review. It does not revise production content.

The question is which page compositions teach the reviewed GF9 rules clearly while matching the original covers and physical formats. The same sample rules appear in three arrangements.

| Variant | Reading order | Main tradeoff |
| --- | --- | --- |
| A, original book structure | Rule columns with nearby component illustrations | Compact and familiar; the battle wheels are smaller. |
| B, teach through the example | Illustration first, followed by the rules it explains | Larger battle plans use an extra page. |
| C, reference and reminders | Short rules sections, reminders and an illustration strip | Easier to scan; less continuous teaching flow. |

The recommended starting point for discussion is A, with B's two-page battle explanation where the larger diagrams help. This recommendation is not a recorded product decision.

## Run and review

After the repository's frozen dependency install, run from its root:

```sh
bun content/gf9/prototype/serve.ts
```

Open <http://127.0.0.1:39611/?variant=A>. The floating arrows and keyboard left/right switch A, B and C. The sample selector includes all four covers and six interior cases. The comparison shows original, archived first delivery and proposed composition at the same physical scale. The first-delivery reference is an archived PDF, not a new capture of current production.

Examples:

- `?variant=A&case=core-setup&zoom=35` compares setup pages.
- `?variant=B&case=core-battle&view=proposed&zoom=65` shows the larger battle example and its continuation.
- `?variant=A&case=ixian-tech&zoom=65` compares the narrow expansion flow.
- `?variant=A&print=1` shows the actual-size sample pack for export.
- `?variant=A&print=comparison` shows the comparison spreads for export.

The prototype uses the real Rulebook renderer and existing Blocks. It runs without a database, authentication or mutations. It does not demonstrate the persistent local app and publisher accepted in [Choose the isolated publishing runtime for local GF9 review](https://github.com/ndelangen/dunezone/issues/2367). That implementation remains separate.

## Sample scope

The core excerpts cover components and setup, shipment and movement, a legal Basic battle and an Atreides introduction. The printed headings identify Basic game scope. The narrow samples cover optional Tech Tokens and Discovery. Discovery uses two pages in every variant. B also gives battle a second page.

These are teaching excerpts, not complete chapters or final pagination. The Atreides sample excludes Advanced powers by design. Full authoring must preserve each faction's Basic and Advanced distinctions, alliance powers, applicable exceptions and module interactions. Existing judgements remain authoritative. No FAQ entries appear in the proposed pages.

`content-notes.md` records the source page mapping and battle calculation. Source evidence appears in review metadata, not repeated Sources paragraphs inside the books. `art-manifest.json` records original PDF hashes, source pages, dimensions and image operations. `baseline-manifest.json` records archived component outputs and the maintained public artwork used by the renderers.

## Formats and artwork

The proposed core pages are 254 x 254 mm. Expansion pages are 132.08 x 254 mm. All four covers use the complete original cover, with no extra title, logo or gradient. The comparison PDF places original, archived A4 and proposed pages side by side at matching physical scale. Its wide sheets are review spreads, not book pages.

Original covers are rendered at 300 dpi, 3000 x 3000 pixels for core and 1560 x 3000 for expansions. Interior reference pages are rendered at 150 dpi. The three Tech Tokens are native 321 x 321 images extracted from their PDF with alpha masks. Larger renders preserve vector edges but add no detail to embedded raster art.

This preview bypasses production cover ingest by serving local files. The current 1600-pixel cover ingest and 2048-pixel maintained print tier still require a deliberate production media-path decision if this cover quality is required. Do not treat the prototype's local 3000-pixel images as proof that production preserves them.

Paragraphs use ordered Blocks in named regions. The CSS adjusts illustration size and spacing within those regions. It contains no paragraph coordinates. Two exact size catalogue entries and scoped cover shading overrides are prototype code. They are not a production migration and must not be merged as the implementation.

## Reproduce the evidence

The checked-in reference images make the review self-contained. Reacquisition is optional and reads the existing local archive plus public media:

```sh
python3 content/gf9/prototype/extract-art.py --sources /Users/me/Projects/Dune/gf9-delivery/sources
bun content/gf9/prototype/prepare.ts
```

`extract-art.py` needs Pillow, pypdf and Poppler. `prepare.ts` needs the archived first-delivery PDFs and images at `/Users/me/Projects/Dune/gf9-delivery`. It also downloads five maintained public print images, with hashes in the manifest. Neither command writes application data.

With the preview running:

```sh
bun content/gf9/prototype/inspect.ts
bun content/gf9/prototype/export.ts
python3 content/gf9/prototype/verify-pdfs.py
```

`inspect.ts` records browser errors, missing images and region overflow and captures every proposed page. `export.ts` creates three proposed sample PDFs and an A comparison PDF from the same renderer. Like the existing publisher in `workers/publisher/rulebook-pdf.ts`, it sets each PDF MediaBox to the declared physical dimensions after Chromium export. Chromium's raw narrow page was 131.911 mm wide. This step corrects the paper edge without scaling the content; the export manifest keeps the raw dimensions. `verify-pdfs.py` measures every final PDF page, checks sample scope labels and renders contact sheets. These are prototype evidence scripts, not a new application test suite.

Expected proposed counts are A 11, B 12 and C 11. Each includes four covers. The comparison has 11 wide spreads. Generated output stays outside Git and is linked from the decision ticket. The ticket remains open until the user responds to the concrete designs.
