# GF9 page composition prototype

This throwaway prototype supports [Approve original-format GF9 teaching page compositions](https://github.com/ndelangen/dunezone/issues/2361). The user selected C as the base and accepted all four covers. Revised teaching samples remain under review. The prototype does not revise production content.

The question is which page compositions teach the reviewed GF9 rules clearly while matching the original covers and physical formats. The initial comparison used the same sample rules in three arrangements. C now carries the focused revisions described below.

| Variant | Reading order | Main tradeoff |
| --- | --- | --- |
| A, original book structure | Rule columns with nearby component illustrations | Compact and familiar; the battle wheels are smaller. |
| B, teach through the example | Illustration first, followed by the rules it explains | Larger battle plans use an extra page. |
| C, reference and reminders | Short rules sections and reminders, with illustrations beside the rules they explain | Selected base; strategic phase explanations need a fuller worked sequence. |

The user's response supersedes the earlier A-with-B recommendation. Keep C's compact structure, but place a component image beside its explanation when the reader needs to identify or interpret it. An illustrated closing strip is suitable only when it does not separate a rule from the image it needs.

Subsequent live feedback rejects a blue bar for every subheading and asks for larger troop markers. Use the existing Text Block's `name` for quieter minor headings. Reserve the strongest bar treatment for the page title or a major division. Movement's collection comparison now uses the existing paired-rows layout, with the two figures beside one another and consequences below. Figure placement should help comparison and reading order rather than repeat the same two-column stack on every page.

The next review is focused. It contains the four-page Shipment and Movement walkthrough, Tech Token images paired with their own starting-holder and trigger rules, and text flowing beside a Discovery card. Accepted covers and unchanged pages are excluded. Do not ask the user to approve them again.

## Run and review

After the repository's frozen dependency install, run from its root:

```sh
bun content/gf9/prototype/serve.ts
```

Open the [focused C review](http://127.0.0.1:39611/?variant=C&review=revision-2&case=core-shipment&zoom=50). Only revised samples appear in its selector and PDF. The full comparison remains available without `review=revision-2`; its floating arrows and keyboard left/right switch A, B and C. The comparison shows original, archived first delivery and proposed composition at the same physical scale. The first-delivery reference is an archived PDF, not a new capture of current production.

Examples:

- `?variant=A&case=core-setup&zoom=35` compares setup pages.
- `?variant=B&case=core-battle&view=proposed&zoom=65` shows the larger battle example and its continuation.
- `?variant=A&case=ixian-tech&zoom=65` compares the narrow expansion flow.
- `?variant=A&print=1` shows the actual-size sample pack for export.
- `?variant=A&print=comparison` shows the comparison spreads for export.
- `?variant=C&review=revision-2&case=ixian-tech&zoom=65` shows paired token rules.
- `?variant=C&review=revision-2&case=ecaz-discovery&zoom=65` shows the illustrated-rule flow.
- `?variant=C&review=revision-2&print=1` shows only the six revised pages.

The prototype uses the real Rulebook renderer and existing Blocks. It runs without a database, authentication or mutations. It does not demonstrate the persistent local app and publisher accepted in [Choose the isolated publishing runtime for local GF9 review](https://github.com/ndelangen/dunezone/issues/2367). That implementation remains separate.

## Sample scope

The core excerpts cover components and setup, shipment and movement, a legal Basic battle and an Atreides introduction. Introduce Basic, Advanced or optional scope at the chapter or sequence opening and flag actual rule differences where they occur. The user rejected repeating that scope in every page title. The narrow samples cover optional Tech Tokens and Discovery. Discovery uses two pages in every variant. B also gives battle a second page.

C's revised movement sequence uses four pages. `shipment-notes.md` records the source and legality checks. Dreamrules' illustrated shipment, distant-group movement, storm and stronghold comparisons informed the teaching sequence. The rules and worked positions use GF9 sources. The focused review includes only Discovery's revised first page.

These are teaching excerpts, not complete chapters or final pagination. The Atreides sample excludes Advanced powers by design. Full authoring must preserve each faction's Basic and Advanced distinctions, alliance powers, applicable exceptions and module interactions. Existing judgements remain authoritative. No FAQ entries appear in the proposed pages.

`content-notes.md` records the source page mapping and battle calculation. Source evidence appears in review metadata, not repeated Sources paragraphs inside the books. `art-manifest.json` records original PDF hashes, source pages, dimensions and image operations. `baseline-manifest.json` records archived component outputs and the maintained public artwork used by the renderers.

## Formats and artwork

The proposed core pages are 254 x 254 mm. Expansion pages are 132.08 x 254 mm. All four covers use the complete original cover, with no extra title, logo or gradient. The comparison PDF places original, archived A4 and proposed pages side by side at matching physical scale. Its wide sheets are review spreads, not book pages.

Original covers are rendered at 300 dpi, 3000 x 3000 pixels for core and 1560 x 3000 for expansions. Interior reference pages are rendered at 150 dpi. The three Tech Tokens are native 321 x 321 images extracted from their PDF with alpha masks. Larger renders preserve vector edges but add no detail to embedded raster art.

This preview bypasses production cover ingest by serving local files. The current 1600-pixel cover ingest and 2048-pixel maintained print tier still require a deliberate production media-path decision if this cover quality is required. Do not treat the prototype's local 3000-pixel images as proof that production preserves them.

Paragraphs use ordered Blocks in named regions. The CSS adjusts illustration size and spacing within those regions. It contains no paragraph coordinates. Two exact size catalogue entries and scoped cover shading overrides are prototype code. They are not a production migration and must not be merged as the implementation.

The wrapped-card sample uses prototype CSS on the existing Card entry Block. The production authoring extension is specified in `illustrated-rule-contract.md`; it has not been implemented. `public/reference/wrapped-rule-reference.png` preserves the user's supplied visual example. Board coordinates in movement scenes place game pieces and routes within an illustration, not page paragraphs.

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

For the next review, regenerate only changed samples:

```sh
bun content/gf9/prototype/inspect.ts --focused
bun content/gf9/prototype/export.ts --focused
python3 content/gf9/prototype/verify-pdfs.py --focused
```

`inspect.ts` records browser errors, missing images and region overflow and captures every proposed page. `export.ts` creates three proposed sample PDFs and an A comparison PDF from the same renderer. Like the existing publisher in `workers/publisher/rulebook-pdf.ts`, it sets each PDF MediaBox to the declared physical dimensions after Chromium export. Chromium's raw narrow page was 131.911 mm wide. This step corrects the paper edge without scaling the content; the export manifest keeps the raw dimensions. `verify-pdfs.py` measures every final PDF page, checks sample scope labels and renders contact sheets. These are prototype evidence scripts, not a new application test suite.

The focused PDF has six pages, four square movement pages and two narrow component examples. The original comparison packs had A 11, B 12 and C 11 pages. The revised full C pack has 14 pages. These are review samples, not final book page counts. Generated output stays outside Git and is linked from the decision ticket. The ticket remains open for feedback on the revised teaching samples.
