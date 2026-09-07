# Rulebook pattern study

Choose a Size and Design when creating a rulebook. Choose a Layout for each page and fill its regions with editable Blocks. This throwaway study makes those four choices visible.

## Run

```sh
bun src/game/rulebook/prototype/serve.mjs
```

Open `/prototype/rulebook-layouts/patterns.html` at the printed localhost address. The study uses the repository's existing assets and fonts and does not contact the application or Convex.

The URL keeps three independent selections: `?design=illustrated&format=square&layout=rail`. Choose Illustrated classic or Restrained expansion; square, A4 or tall; and one of six interior arrangements or a cover. The bottom arrows switch designs. The same content stays selected when the design or size changes. Reveal layout regions shows where blocks belong.

The [pattern catalogue](./PATTERNS.md) records the proposed designs, layouts and eleven block shapes with their editable fields. The study demonstrates their appearance; it does not add them to the live editor.

## What changed after the first experiment

The supplied screenshots show a coordinated book design. It includes heading bands, faction colours, callout treatments and alternating page decoration. Layouts arrange content within that design.

The original artwork still exists at `public/page/bottom.svg`. The old JSX renderer selected the left or right half for facing pages. This study uses that artwork directly, with the worm on the left and the fighter on the right. The surviving FactionSynopsis styles also provide a reference for mirrored panels. The restrained design keeps the paper, coloured bands and alternating folios with less decoration. Both designs can be chosen at all three sizes.

The historical renderer can be inspected with `git show 828a36c1e54^:src/game/book/utils/Page.tsx`. Recovering its visual treatment does not require authors to write JSX. Block fields hold content; the book design supplies its appearance.

Samples are short historical excerpts and paraphrases, used to expose the patterns. They are not complete rules pages. Square dimensions remain provisional, and the tall sample interprets folded A4 as a long, narrow page.

The [earlier typesetting experiment](./TYPESETTING.md) remains available at `index.html`. It explored content fitting and was too detailed for the current design question.

The prototype stays on `norbert/rulebook-layout-spike`, based on freshly fetched main at `ccf72d57cb4`. No application changes are promoted.
