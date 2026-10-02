# Social card layout review

Three throwaway layouts answer [Review faction and asset social card layouts](https://github.com/ndelangen/dunezone/issues/1715). The production delivery contract is already settled. This review chooses presentation, not a new caching or publication system.

Open [the comparison](http://127.0.0.1:4325/prototype/social-cards/?variant=A&sample=faction). The bottom bar switches layouts and preserves the variant and example in the URL. Names and excerpts can be edited locally. Each card is shown at full aspect ratio and at 360 pixels wide inside an illustrative social link card.

- A places the name and excerpt beside the complete artwork. This is the recommendation because it continues the earlier Test Faction card and accommodates cards, tokens and decks without separate templates.
- B puts artwork above a title band and omits the excerpt inside the image.
- C leads with a large name on a light background and uses a small artwork thumbnail.

No design has been approved yet. Keep the ticket open until Norbert chooses. The earlier faction card remains the baseline in the social-cache-spike branch, commit `6b9e2d806a465373e484cf9f7aa71c2c5270012a`.

## Run

After installing this branch's frozen dependencies, start the standalone local Worker with:

```sh
bun run spike:social-cards
```

It binds only loopback port 4325 and inspector port 9235. No backend or credential file is required. Stop with Ctrl+C. The prototype is outside the application route tree and has no production entry or deploy script. Its development configuration enables the review UI; its handler refuses requests when built with NODE_ENV=production. Do not merge this branch as the implementation.

## Inputs and rendering

The review contains public Test Faction, Small Shirt, Water, Immunity, Dreamrules Spice Deck and GF9 Techtokens. The bundle has no published preview and exercises the actual fallback. There are also explicitly marked synthetic long-text, Latin-glyph and missing-artwork examples. Long names cap at 78 Unicode code points; excerpt caps vary by layout. These are prototype layout limits, not a newly adopted production schema.

The faction excerpt comes from its first advantage, matching the original spike. Assets use their About text, which is empty for several examples. We leave it empty. Artwork uses contain sizing, with a circular frame for round tokens. The fallback is a Dune Zone monogram. The design review must confirm those presentation choices along with the selected layout.

`public/fixtures.json` and `public/art/` are fixed public evidence so the comparison remains reproducible. These local files are not a proposal for prepared production snapshots. To refresh them deliberately:

```sh
bun run workers/publisher/social-card-prototype/prepare.ts
```

That script performs anonymous public queries and downloads the existing published artwork. It strips records down to review fields and has no mutation, authentication or publication operation. Serving the prototype does not query Convex. The image request carries text, kind, shape, layout and a bounded reference to bundled artwork. Satori produces SVG and resvg WASM encodes PNG; there is no browser capture in image generation.

The selected versions are the earlier spike's Satori 0.26.0 and resvg 2.6.2. Wrangler is the repository's pinned version. Its bundled runtime rejected today's compatibility date, so the prototype uses 2026-09-30, the newest supported date reported by that runtime. Production runtime selection remains implementation work.

## Evidence

Regenerate the 27 PNG examples while the local server is running:

```sh
node workers/publisher/social-card-prototype/render-examples.mjs
```

The script checks PNG signatures and dimensions and writes images plus `evidence/render-results.json`. It is a review capture script, not a new test suite. Local render durations are elapsed times, not hosted CPU billing measurements.

All 27 combinations rendered at 1200 by 630. Visual inspection covered all three faction layouts, long names and excerpts, portrait cards, the landscape token, the deck, supported Latin glyphs and the bundle fallback. The browser comparison also exercised layout switching and missing artwork at the 360-pixel feed size. `evidence/browser-A.png` shows the review page in the in-app browser.

The isolated prototype typecheck and Worker dry run passed. No production release, social-platform fetch, access-control test or approval is claimed by this visual prototype. Hosted delivery and cost verification remain separate map work.

Worker setup follows the current [Cloudflare Workers guidance](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) and [Wrangler command reference](https://developers.cloudflare.com/workers/wrangler/commands/), checked on 2 October 2026.
