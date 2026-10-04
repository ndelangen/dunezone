# Homepage editorial media

The homepage announces Dune Play as coming soon and points readers toward existing authoring tools. It does not link to the unreleased Play route.

The composition lives in `src/app/routes/_app/index.tsx`. The portrait list, troop list, published cards and community faction are editorial selections. Replace these references as stronger community examples arrive; they do not require a backend query.

The four sources in `media/web/homepage/` came from the approved homepage E prototype at commit `f64caa3c0c9`:

- `board.png`: a 3000 by 1420 capture of the development board, with six faction tokens on the table and no controls. Its alpha channel lets the page show through.
- `cover.jpg`, `map.jpg`, `factions.jpg`: pages from the demonstration Arrakis field guide Rulebook created during the homepage design work. The page identifies them as demonstration pages, without implying a published community Rulebook.

`bun run generate:images` produces the web variants. The `web/homepage` image rule preserves transparency and the board's 3000-pixel detail. The homepage does not import Play state, interaction code or fixtures.

The three published cards credit their creators beside the images. The Space Orks examples credit BigDave and describe the faction as a work in progress. The Group alliance card is an illustration made for the invitation, not a saved community Asset.

Arrival animations run once as each chapter enters view. The shared motion preference disables arrivals and hover movement. Content remains visible when IntersectionObserver is unavailable.

## Social preview

`media/web/homepage-social-play.jpg` is the approved 1200 by 630 social composition. It combines the header's desert artwork, the development board, two demonstration Rulebook pages and the Nela, Koraun and Varda Nereth portraits. The homepage's fonts and logo supply the words and identity.

The existing image pipeline produces `/web/homepage-social-play-large.jpg` at its native dimensions. The route supplies canonical, Open Graph and Twitter metadata, including the image description, JPEG type and dimensions. The exact `/` path uses anonymous server rendering with the homepage in `data-only` mode, so crawlers receive those tags without running JavaScript while the game artwork keeps its browser-owned SVG IDs. It uses the existing release-scoped HTML cache and makes no metadata query. Other routes keep their existing delivery behavior.

The image is a static editorial export, not a request-time capture. When its announcement changes, replace the source with a newly reviewed composition and use a new filename so shared-link image caches can refresh.
