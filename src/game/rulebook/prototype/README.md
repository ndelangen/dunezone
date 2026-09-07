# Rulebook layout spike

Throwaway experiment on `norbert/rulebook-layout-spike`, based on main at `2b18ec6bfc81641dce38a336b04235515de73b23`.

Question: which page arrangements preserve useful Dune rulebook content at square, A4 and tall sizes without shrinking the body type?

## Run

From the repository root:

```sh
bun src/game/rulebook/prototype/serve.mjs
```

Open the printed localhost URL. Dependencies come from the repository's frozen install. The server binds only to localhost and serves the prototype, its local assets and its fonts. It does not start the app or contact Convex.

The single review entry accepts `?variant=A&format=a4&specimen=fremen`. Variants are A, B and C; formats are square, a4 and tall; specimens are fremen, locations, karama, faq and all. The arrows in the bottom bar and the keyboard left/right keys change variants. Native controls keep their normal arrow-key behavior. Selections live in the URL, with no saved content changes.

The review controls and the isolated print entry live beside the Rulebook renderer. Nothing imports this directory from the application, Storybook or publisher, so the switcher is absent from production output. No winner has been promoted.

## What is being compared

- A, Classic columns: two independent reading columns on wide paper, one on tall paper; compact section bars and adjacent figures.
- B, Guided sections: a numbered section rail beside horizontal reading bands, stacked above the body on tall paper.
- C, Reference panels: individual entries with repeated group context. The Karama reference uses a real table on wide paper and labeled records on tall paper.

All three use the same 88 stable content items and bundled Caladea body text at 10.5 pt. The physical formats are 210 × 210 mm, 210 × 297 mm and 105 × 297 mm. Square size and the interpretation of folded A4 remain working assumptions.

The page title and footer identify these as historical layout specimens. They are not a new canonical rules edition.

| Specimen | Source | Coverage |
| --- | --- | --- |
| Fremen | `fremen.pdf`, p. 16 | All rules on that faction reference page, 13 items |
| Location tokens | Ecaz and Moritani, p. 13 | All page context and eight illustrated tokens, 11 items |
| Karama lookup | Rules compilation, printed p. 46 | All 50 ability rows across ten factions, plus the alliance note |
| Karama Q&A | November 2020 FAQ, pp. 7-8 | Six questions, including the complete eight-faction answer, 13 items |

The eight token images are direct extracts from the user-supplied Ecaz and Moritani PDF. They are 145 × 145 px and retain the source's artwork. `specimens.mjs` records exact source filenames. Existing repository assets provide the faction and Karama marks. Paragraph breaks and a few headings are adapted for structured composition; the rule meanings are preserved.

## Findings

Classic is the strongest starting point for ordinary rules. The full Fremen specimen fits one A4 page, two square pages or two tall pages. Guided and Reference both need two A4 pages and three tall pages for the same specimen. Their repeated context is useful, but it consumes space that a routine rule page needs.

The guided arrangement is useful for illustrated explanations. It puts group context in a stable place and gives each figure room beside its explanation. It should be a recipe for selected pages rather than the default throughout a book.

A table deserves its own representation. Reference C puts the Karama specimen into two A4 table pages. Turning the same rows into individual tall records takes six pages; Classic's compact tall rows take four. Labeled records solve narrow-column readability, but repeating every label and group is expensive. The production layout should repeat group context at boundaries and use compact rows within each group.

Measured page counts for all four specimens, with each specimen starting on a new page:

| Variant | Square | A4 | Tall |
| --- | ---: | ---: | ---: |
| A, Classic | 10 | 6 | 11 |
| B, Guided | 13 | 9 | 12 |
| C, Reference | 10 | 8 | 15 |

The spike validates sharing semantic items across format-specific arrangements. The same IDs preserve source order and completeness while page numbers change. It does not validate a production editing or reconciliation model. Current Rulebook Page ownership, Save, Publish and Edition storage are unchanged.

The main unresolved issue is composition quality at the end of a section. Whole-item placement sometimes leaves a sparse last page or column. It keeps short rules and figures intact, but it cannot yet split a single oversize item at a safe paragraph boundary or balance a spread. A production implementation needs explicit continuation rules and a way to review page arrangements. Do not promote this measurement loop as a general pagination engine.

## Evidence

The headless Chromium capture checked all 36 combinations of three variants, three sizes and four specimens. Every combination retained all expected IDs in order, with no duplicate IDs or measured content overflow. Body paragraphs remained 14 CSS px, equivalent to 10.5 pt. The mobile review at 390 px had no horizontal overflow; button and keyboard switching both worked. Assets and fonts loaded without HTTP or browser errors.

The classic PDFs contain the same 88 items in each size. All source paragraph strings and table cell strings were found in each PDF's extracted text. All 27 output pages were rendered with Poppler and visually inspected as contact sheets, with representative pages checked at readable resolution. Page boxes are exactly the requested millimeter dimensions after normalizing Chromium's small paper-size rounding. Type is not rescaled.

```sh
node src/game/rulebook/prototype/capture.mjs http://127.0.0.1:PORT/prototype/rulebook-layouts/
```

Use the port printed by the running server. Capture writes ignored `output/measurements.json`, page screenshots and three PDFs under `output/pdf/`. The PDFs use Classic for comparison; the browser can print any selected variant. These are reading-order pages, without booklet imposition.

Focused lint, formatting and the app-layout guard pass. No maintained test suite or production release was added for this throwaway branch.

## Next decision

Use Classic for ordinary reading, retain Guided for selected illustrated pages, and take the wide table from Reference. Keep structured source items separate from per-format placement. Before implementation, settle the square size and prototype safe continuation of a single long answer, including what happens to its saved placement when the text changes.
