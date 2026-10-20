# Remaining card correction decisions

This is a read-only prototype for [Approve faction, logo and component correction treatments](https://github.com/ndelangen/dunezone/issues/2362). No application renderer or production record changed.

## Accepted Karama

The user accepted the revised Karama on 20 October 2026. Do not reopen that treatment.

The [Table Talks physical unboxing at 26:56](https://www.youtube.com/watch?v=H2FJtqZjMXI&t=1616s) shows both main-deck replacements. Both have a dark green title, hand badge and text-only body. The saved video-only reference is `public/card-references/karama-main-replacement-video.png`. It establishes the main card independently of the Richese cache.

The supplied `/Users/me/Projects/Dune/dune-assets/treachery/richese/Wpa1108.png` contains a clean Richese cache face. Its third card is separately cropped as `public/card-references/local-karama-richese-cache.png`. The cache face has the same replacement wording and a Richese lamp badge. The physical cache photograph from BGG image 6747306 corroborates this layout.

The 705-character transcription was independently checked against both sources. Straight quotes, fraction typography and list markup adapt the text to the existing parser. It preserves setup and At Start timing, one attempted use, alliance abilities, pre-reveal battle timing, Guild-rate shipment paid to the Bank, unrevealed overbidding and/or free acquisition, the full-hand restriction, and Special Victory/Special Karama immunity.

Discard after use, Advanced Special Karama and the Richese-auction restriction remain in the asset description and rulebook. They are not printed on the verified replacement face. The main deck retains two copies and the cache retains its separate member.

The older local `treachery/gf9/karama.jpg` has obsolete phase-long cancellation wording. It is not the replacement. The `treachery/ream_richese` images are homebrew designs. Treachery.online's current public default skin identifies its artwork as 1979 Art. None of those establishes a current GF9 replacement face.

Production needs a text-only Treachery format using the existing plain card frame. This prototype composes that appearance through Custom Card rendering, but it must not change Karama's stored Treachery type. The accepted body uses native Candara 38.75 and fits completely.

## Discovery uses the linked board

The supplied `/Users/me/Projects/Dune/dune-assets/spice/expansion3.png` contains all six Discovery faces. The source hash, dimensions and individual reference crops are in `local-card-source-manifest.json`. The [physical Discovery photograph](https://boardgamegeek.com/image/9022457/dune-ecaz-and-moritani), by Frike0, confirms those pairings and printed instructions.

The user rejected embedding map crops and bitmap badges. Use the existing `SpiceCard` renderer with the existing `arrakis-official` board entity, native territory tints and placed token assets. The comparison images remain references only. No printed map details or new board geometry are being added.

Use the standard Spice header circle and background with existing vectors only. Hiereg uses the existing Fremen symbol and Smuggler uses the existing Guild symbol, matching the current Discovery token backs. Newly drawn fruit and goggles icons were rejected. No new vector or media registration is required. The current Spice schema already supports these vector IDs.

| Blow territory | Spice sector | Token destination | Token sector | Type |
| --- | --- | --- | --- | --- |
| Sihaya Ridge | Only | Cielago East | West | Hiereg |
| Rock Outcroppings | South | Meridian | West | Hiereg |
| Hagga Basin | West | Gara Kulon | Only | Hiereg |
| Funeral Plain | Only | Pasty Mesa | North | Smuggler |
| Wind Pass North | North | Plastic Basin | Middle | Smuggler |
| Old Gap | Middle | False Wall West | Middle | Smuggler |

Each card has one copy and places six spice. Both destinations receive separate whole-territory tints, orange for the spice blow, green for Hiereg and blue for Smuggler destinations, as the user requested. The existing tint mechanism supports whole territories. Two placed markers identify the spice and Discovery locations. Their source coordinates are transformed from the archived source's center 281,311 and radius 242 into the native board center 243.53,243.53 and radius 242.5. The False Wall West marker is moved inside the native territory with a 0.53-degree direction change, retaining its middle-sector direction. Validate every point against its target territory before publication. Sector names remain in the book and asset description.

Generic Hiereg and Smuggler type-marker assets can depict the face-down types through ordinary token fronts. These illustration markers do not add random Discovery outcomes or alter pool quantities. Board placements currently render fronts only, so do not pretend the prototype selected an existing token's back.

The six existing records are Custom Cards. The current authenticated writers cannot change their types. The narrow conversion requirements are in `spice-conversion-requirements.md`. Keeping IDs also requires checking type-sensitive URLs, references and publication dependencies. This gap does not justify embedding board artwork in Custom Card layers.

## Review scope

Karama, covers, faction treatments, logo, full-title fitting and the accepted central-vector token treatment stay settled. Review only the six revised Discovery cards and any new product decision exposed by their native implementation.

## Accepted map recipe

The user accepted this combination on 20 October 2026: brightness 55%, contrast 260%, map color 0%, paper color 65%, opacity 100%, downward shift 28 and color-burn blending. Preserve those values as the named GF9 treatment and the reset state. The corresponding native map top is 263. The board, tints, neutral paper texture and token placements move together; the filter never changes tint or token colors.

The paper control uses an aligned copy of the existing card-paper image beneath the native board, rather than applying a backdrop filter to the SVG. No new map artwork or vectors are introduced. Verify the accepted layered treatment through the publication renderer before production recapture. This acceptance settles map appearance, not future production implementation or unseen content.
