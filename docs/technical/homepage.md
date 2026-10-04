# Homepage editorial media

The homepage announces Dune Play as coming soon and points readers toward existing authoring tools. It does not link to the unreleased Play route.

The composition lives in `src/app/routes/_app/index.tsx`. The portrait list, troop list, published cards and community faction are editorial selections. Replace these references as stronger community examples arrive; they do not require a backend query.

The four sources in `media/web/homepage/` came from the approved homepage E prototype at commit `f64caa3c0c9`:

- `board.png`: a 3000 by 1420 capture of the development board, with six faction tokens on the table and no controls. Its alpha channel lets the page show through.
- `cover.jpg`, `map.jpg`, `factions.jpg`: pages from the demonstration Arrakis field guide Rulebook created during the homepage design work. The page identifies them as demonstration pages, without implying a published community Rulebook.

`bun run generate:images` produces the web variants. The `web/homepage` image rule preserves transparency and the board's 3000-pixel detail. The homepage does not import Play state, interaction code or fixtures.

The three published cards credit their creators beside the images. The Space Orks examples credit BigDave and describe the faction as a work in progress. The Group alliance card is an illustration made for the invitation, not a saved community Asset.

Arrival animations run once as each chapter enters view. The shared motion preference disables arrivals and hover movement. Static content remains visible without an observer or JavaScript.
