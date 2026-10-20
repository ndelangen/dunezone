# Original GF9 formats and artwork

Research for [Establish original GF9 formats and artwork provenance](https://github.com/ndelangen/dunezone/issues/2360), under [GF9 correction: local review and two production content batches](https://github.com/ndelangen/dunezone/issues/2357). Inspected on 20 October 2026 against repository commit `77c26fcfa1a5ff61ae36b087fb55150f4da99497` and the supplied PDFs. This report establishes source facts. It does not approve the representative designs or change production.

## Source files and physical formats

The four supplied documents contain all four original covers, the publisher logo, a nonempty CHOAM emblem and explicitly named portraits for both missing faction heads. No generated substitute is needed to establish identity. Their available raster resolution varies.

Every page MediaBox was measured again with pypdf. Coordinates below use PDF points, with crop bounds measured from the top left by pdfplumber. Page numbers are one-based PDF page numbers.

| Book | Pages | MediaBox, points | Physical size | SHA-256 |
| --- | ---: | --- | --- | --- |
| Core | 24 | 720 × 720 | 254 × 254 mm | `6c55d28e93b6948a34d20b0f50e1087494e06f237f8c43e7e4c0cac3810b752d` |
| Ixians & Tleilaxu | 12 | 374.4 × 720 | 132.08 × 254 mm | `9dc631968839d6e8935acb30ac301301cfea7ed07a78a3aac266648f21cf357d` |
| CHOAM & Richese | 12 | 374.4 × 720 | 132.08 × 254 mm | `ee08ac180ca9824728532212bbd54de3e258ed81ad30051063f5633928fb7407` |
| Ecaz & Moritani | 16 | 374.4 × 720 | 132.08 × 254 mm | `196101a82769fd40dca308f5fb8fa3a322321e72b9eb813c255c2e3a24f981a9` |

Primary document content is available through these preserved attachments and mirror. The core host is a community mirror of the GF9 document, not its publisher.

- [Core GF9 rulebook mirror](https://raw.githubusercontent.com/ronaldossendrijver/treachery.online/master/Client/wwwroot/docs/Dune-Rulebook.pdf).
- [Supplied Ixians & Tleilaxu PDF](https://github.com/user-attachments/files/33447701/BA7A5BD340F4B147740B6D25209C917D6DF2DFC0_IxianAndTleilaxuRulebook.pdf).
- [Supplied CHOAM & Richese PDF](https://github.com/user-attachments/files/33447703/9DD6A03F57C5F1B662DDEAD2D21B210DB2492F64_ChoamAndRichese.Rulebook.pdf).
- [Supplied Ecaz & Moritani PDF](https://github.com/user-attachments/files/33447702/2675E24EDC2A720CCF7B969BF7DC831DD28649D9_EcazMoritani-Rulebook-LOWRES.pdf).

The corresponding immutable local inputs are `/Users/me/Projects/Dune/gf9-delivery/sources/{base,ixian-tleilaxu,choam-richese,ecaz-moritani}.pdf`. Their download provenance is in that folder's `manifest.json`. The unofficial revised document, compilation and FAQ are not authorities for these four books' physical presentation. The prepared FAQ corpus was not re-audited for this research.

## Covers

Use page 1 of each respective PDF, with the full page bounds from the table. All four complete covers were visually inspected. Keeping the whole page retains original lettering, original faction bands and the correct artwork composition.

| Cover | Content that identifies the correct original | Source quality |
| --- | --- | --- |
| Core | Worm and rider, two moons, original Dune title and tagline, RULEBOOK at the foot | Mixed vector and raster. Page 1 has 475 vector curves and embedded raster elements around 96 dpi. It is inaccurate to describe the entire cover as a 96 dpi image. |
| Ixians & Tleilaxu | Narrow worm scene, publisher logo, blue faction band with both seals, HOUSE EXPANSION footer | Mixed vector and raster, including worm raster elements around 361 dpi. |
| CHOAM & Richese | Worm cavern, CHOAM and Richese seals, blue name band, HOUSE EXPANSION footer | Main background image is 754 × 1164 pixels at about 144 dpi at its original placed size. Lettering and other page elements also include vector content. |
| Ecaz & Moritani | Stone circle and statue, distant explosion, both seals, original faction band | Main background image is 785 × 1389 pixels at about 150 dpi. The supplied filename correctly warns LOWRES. Vector page elements remain sharper than this background. |

Rendering a complete page at 300 dpi preserves its vector lettering and curves at that output resolution. It does not create new detail in the embedded raster artwork. Extracting a single background image would omit lettering and bands. Do not call an enlarged extraction a high resolution original.

Matching reference PNGs already exist under `/Users/me/Projects/Dune/gf9-delivery/iteration-plan/reference-images/` as `source-base-cover.png`, `source-ixian-cover.png`, `source-choam-cover.png` and `source-ecaz-cover.png`. Those small PNGs are inspection references, not print masters. Regenerate print masters from the preserved PDFs.

Existing maintained scenes `sandworm`, `worm-cavern` and `stone-circle` can illustrate the same subject, but their landscape framing and missing cover lettering do not reproduce the original complete covers. The existing wrong `spice-harvester` and `desert-citadel` selections should not survive the correction.

## Publisher logo and CHOAM emblem

The Ixians & Tleilaxu cover contains the genuine Gale Force Nine publisher mark. Its embedded image `Im2` is 313 × 142 pixels with transparency. Its page placement is `[28.48, 517.80, 123.34, 560.83]`, about 33.47 × 15.18 mm and 238 dpi. Inspection confirms the actual spiral/sun mark and GaleForce nine lettering, in pale cream. This is a usable original for the requested Ruleset image. Preserve the logo's aspect ratio and transparency; test contrast in the actual Ruleset tile before selecting any backing treatment. Do not replace it with the Dune title or an AI imitation.

The existing `media/vector/logo/choam.svg` contains only an empty root with `viewBox="0 0 3280 3280"`. It cannot produce visible artwork. `media/vector/troop/choam.svg` is populated, but represents different artwork. Substituting it would confuse an existing working troop graphic with the absent faction emblem.

The official CHOAM faction emblem is the red upper half and black lower half of a disc with a pale circular outline. The CHOAM & Richese PDF shows it clearly on page 3 above the CHOAM text. Embedded image `Im14` is 144 × 144 pixels, at `[151.26, 42.01, 223.14, 113.90]`, about 25.36 mm square at 144 dpi. The cover also has the emblem inside the original gold player marker, embedded image `Im1`, 164 × 163 pixels, at `[17.90, 577.61, 99.69, 658.83]`.

For the source manifest, distinguish the bare faction emblem from the decorated player marker. A faithful manually authored vector of the simple verified red/black disc can avoid magnifying the small raster. That is a possible implementation treatment, not a research approval. Altering the existing shared stock SVG would affect every caller of that artwork key, so the correction must verify those callers or choose an explicitly GF9-scoped key. Either path needs normal artwork review and renderer/publication verification.

## The two faction-head portraits are identifiable

Both official identities are visible on the large named discs on CHOAM & Richese page 3. They are separate from the five ordinary leaders beside them. I inspected both the complete page and extracted embedded images, including their name bands.

| Character | Source image | Native pixels | Bounds on page 3 | Identity evidence |
| --- | --- | --- | --- | --- |
| Ur-Director Malina Aru | `Im11` | 227 × 215 | `[35.15, 195.50, 148.15, 302.52]` | The pictured disc itself says UR-DIRECTOR MALINA ARU. |
| Count Ilban Richese | `Im12` | 226 × 214 | `[35.34, 504.13, 147.95, 611.01]` | The pictured disc itself says COUNT ILBAN RICHESE. |

At their original roughly 39.8 × 37.8 mm placement, both are about 144 dpi. At 300 dpi, the complete source tile supports only about 19.2 × 18.2 mm without enlargement. A face-only crop contains fewer pixels. These are verified original portraits at modest resolution, not missing identities.

The whole embedded tile includes the colored faction disc, name lettering and lower graphic. It is not a clean transparent person cutout suitable for dropping unmodified into the existing portrait renderer. The prototype must compare a conservative face crop/mask against the source and show the final rendered head at actual size. Keep the unmodified named tile as provenance. Do not invent missing shoulders, repaint the face, silently enhance it with generative tools, or leave the original band underneath a second renderer band.

`content/gf9/portrait-provenance.json` and the README currently state that both characters use `/image/leader/ilya/cheap-hero.png`. That is an acknowledged anonymous substitution. Once the real crops are approved and saved, update both records and remove the substitution claim. No existing verified Ilban/Malina key was found in the checked catalogue. The custom approved leader collection contains different fictional faction concepts and does not identify either of these people.

## Instructional component art

The original pages provide concrete targets for the visual prototypes. Use original source illustrations or matching maintained GF9 components where their identity and mechanics agree.

| Teaching purpose | Original reference | Available material and constraints |
| --- | --- | --- |
| Board and component orientation | Core page 4 | Annotated complete physical board, turn track, sectors, spice bank, player circles and Battle Wheel assembly. Board image `Im0` is 465 × 516 pixels at `[286.65, 70.15, 635.32, 457.11]`, about 96 dpi. Annotation lines and labels are separate page objects. A bare image extraction loses them. |
| Faction sets, decks and pieces | Core page 5 and faction pages 3, 16-19 | Source component pictures plus existing saved GF9 faction/member/troop/card references. Small raster components are around 96 dpi, so prefer matching maintained renderers for large diagrams. |
| Basic phases and battle | Core pages 7-11 | Storm/phase examples and Battle Wheel. Rebuild legal GF9 plans with existing battle and transfer Blocks rather than copying a small diagram whose text becomes unreadable. |
| Advanced forces | Core page 13 | Illustrated advanced-faction force material; use the actual GF9 force variant and quantity in any reconstruction. |
| Tech Tokens | Ixians & Tleilaxu page 4 | Three source token pictures, each 321 × 321 pixels at about 300 dpi. Their bounds are `[49.53,457.51,126.40,534.39]`, `[138.20,457.51,215.07,534.39]` and `[229.00,457.51,305.87,534.39]`. The visible left-to-right order is Axlotl Tanks, Heighliners, Spice Production. |
| Ixian forces and mobile stronghold | Ixians & Tleilaxu page 9 | Four source component images. Existing authored troop and stronghold references avoid a new block type. |
| No-Field and auction support | CHOAM & Richese pages 5-6 | Richese component pictures and rules; use current saved GF9 token/card identities. |
| Terror tokens | Ecaz & Moritani pages 5-6 | Actual token pictures next to their effects, around 150 dpi in this low resolution source. |
| Homeworld, Nexus and Discovery | Ecaz & Moritani pages 9-13 | Rules and illustrated cards/tokens, with four images on page 11, five on page 12 and eight on page 13. Prefer the saved GF9 cards/tokens where they provide sharper equivalent components. Do not copy the source FAQ pages into the teaching books. |

Core page 4 is visibly mixed-column, with an unequal text/diagram composition. The original narrow expansion page 4 is one readable main flow with inline Tech Tokens. This is evidence for varying the core grids while retaining single-column expansion pages where they fit. It does not require two columns on every core page or any narrow expansion page.

The accepted geometry-only board remains unchanged. An original annotated board illustration can explain the physical board in the book, or existing Board scene annotations can explain play geometry. Neither choice commits this effort to adding printed board features.

## Existing controls and measurable limitations

The following paths were inspected at the pinned repository commit.

- `src/shared/rulebooks/contents.ts` already has mixed-column layouts, referenced illustrations, illustrated inventories, faction introductions, battle diagrams, card blocks, transfers and board scenes. `sources.ts` binds stock artwork, saved assets, factions, members, troops and boards. A newly maintained static image must enter the appropriate artwork catalogue before a stock reference validates. Arbitrary image URLs are not a general interior Block source.
- `src/game/rulebook/RulebookRenderer.tsx`, `CoverPage`, can hide the extra Dune logo with `showDuneLogo: false`, hide the page title with `showHeading: false`, hide the subtitle and leave supporting text empty. Disable the separate cover footer when using a complete original cover, or its band and emblems would be duplicated.
- `RulebookRenderer.css` always adds a gradient through `.rulebookImageCover::after`. The image itself uses `object-fit: cover`. Exact original aspect ratios prevent unintended crop; a scoped no-shade treatment is still needed. Changing every existing cover globally would alter unrelated books.
- `src/shared/rulebooks/coverImage.ts` stores a rehosted rendition with width, height and source URL. The normal authenticated Rulebook cover ingest is suitable for persistent references and immutable Editions, but its maximum long edge is 1600 pixels. `src/shared/user-images/contract.ts` and `workers/publisher/user-images.ts` enforce that bound and scale down without cropping. On a 10-inch tall original, the stored maximum is 160 dpi.
- Maintained cover media uses a 2048-pixel print tier in `src/shared/assetRules.ts`, about 205 dpi at 10 inches. The current scene presets use that route. Neither current route promises a 3000-pixel, 300 dpi complete cover. If the visual decision requires that standard, it must choose a narrow media/ingest extension or explicitly accept the current limit. Enlarging an input before ingest cannot bypass it.
- `media/raster.lock.json`, `src/shared/media/map.generated.ts` and `docs/technical/media-runbooks.md` describe the content-addressed maintained-media pipeline. New originals, recipes and catalogue keys must stay reproducible. A raw local file path is not a production URL. The Ruleset settings flow already rehosts a supplied image through authenticated `rehostCover` before saving it.

Repeated Sources paragraphs, all-one-column authorship and missing instructional images are content composition defects. They do not justify a free-positioned text engine. Source crops above describe media extraction, not coordinates for paragraphs in a Rulebook Page. Page regions should contain ordered flowing Blocks.

## Acceptance inputs for the human prototypes

1. Compare all four complete covers to the correct original PDF page 1 at matching aspect ratio and physical size. Check no cropped letters, duplicate titles/bands, extra gradient, or incorrect cover scene. Measure final PDF MediaBoxes independently.
2. Show a core components/setup page, phase page, battle example and faction introduction with the real GF9 data. Check reading order, column widths, artwork resolution and that each illustration teaches a neighboring rule.
3. Show a narrow Tech Token page and an expansion module page with actual cards/tokens. Check inline labels at 100% print size, not only enlarged browser zoom.
4. Show the actual Ruleset tile with the genuine publisher logo. Show CHOAM token/sheet output with its intended nonempty emblem, and both real faction-head crops next to their named source tiles.
5. Record output pixel sizes, placed millimeters and effective dpi. Inspect reader HTML and actual generated PDF/image output. The specification must distinguish an accepted low resolution source from a renderer or ingest loss.

The source availability question is answered. Human choices still remain for acceptable source/output resolution, portrait crop treatment and the representative page designs. If a clean larger portrait or a higher resolution CHOAM/Ecaz cover is required, request a publisher-quality original or a verified scan of the named physical component. A guessed face or generative replacement cannot meet that fallback. The publisher site and its low resolution CHOAM PDF returned HTTP 403 during this check, so no claim is made that a better official download was found. Existing supplied files establish the facts above without that download.

Research artifacts, including measured image bounds, extracted named tiles and inspected page renders, are preserved locally under `/tmp/gf9-art-research/` and copied to `/Users/me/Projects/Dune/gf9-delivery/iteration-plan/original-art-research/`. Extraction is evidence only; no new artwork or application records were installed.
