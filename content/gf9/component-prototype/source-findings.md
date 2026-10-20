# GF9 component source findings

Read-only source investigation, 20 October 2026. No existing prototype files or production content changed. Temporary decoded image references are in `/tmp/gf9-authentic-source-inventory/`, with `inventory.json` and `contact.jpg`.

The official PDFs contain usable original artwork for the Tech tokens, all eight Discovery fronts and both backs, Hidden Mobile Stronghold, Destroyed Shield Wall and Kwisatz Haderach card and counter. Exact full GF9 Karama, Rock Outcrops and Discovery Sihaya Ridge faces were not found in the inspected source images. Do not substitute the old card GIFs as GF9 originals.

## Exact reusable original sources

All page numbers are one-based PDF pages. Source PDFs are `/Users/me/Projects/Dune/gf9-delivery/sources/`.

| Component | PDF and image | Native pixels | Usable local file |
| --- | --- | --- | --- |
| Axlotl Tanks | Ixian & Tleilaxu, p4, Im2 | 321 × 321 | `/Users/me/.codex/worktrees/gf9-page-prototype/dunezone/content/gf9/prototype/public/reference/tech-token-axlotl-tanks.png` |
| Heighliners | Ixian & Tleilaxu, p4, Im0 | 321 × 321 | `/Users/me/.codex/worktrees/gf9-page-prototype/dunezone/content/gf9/prototype/public/reference/tech-token-heighliners.png` |
| Spice Production | Ixian & Tleilaxu, p4, Im1 | 321 × 321 | `/Users/me/.codex/worktrees/gf9-page-prototype/dunezone/content/gf9/prototype/public/reference/tech-token-spice-production.png` |
| Hidden Mobile Stronghold | Ixian & Tleilaxu, p9, Im3 | 321 × 321 | `/tmp/gf9-authentic-source-inventory/ixian-tleilaxu-p9-3-Im3.png` |
| Destroyed Shield Wall | Base, p5, Im12 | 169 × 49 | `/tmp/gf9-authentic-source-inventory/base-p5-5-Im12.png` |
| Kwisatz Haderach card | Base, p5, Im14 | 144 × 201 | `/tmp/gf9-authentic-source-inventory/base-p5-7-Im14.png` |
| Kwisatz Haderach +2 counter | Base, p5, Im15 | 86 × 54 | `/tmp/gf9-authentic-source-inventory/base-p5-8-Im15.png` |
| Hiereg back | Ecaz & Moritani, p12, Im3 | 145 × 145 | `/tmp/gf9-authentic-source-inventory/ecaz-moritani-p12-3-Im3.png` |
| Smuggler back | Ecaz & Moritani, p12, Im4 | 145 × 145 | `/tmp/gf9-authentic-source-inventory/ecaz-moritani-p12-4-Im4.png` |
| Jacurutu Sietch | Ecaz & Moritani, p13, Im0 | 145 × 145 | `/tmp/gf9-authentic-source-inventory/ecaz-moritani-p13-0-Im0.png` |
| Cistern | Ecaz & Moritani, p13, Im1 | 145 × 145 | `/tmp/gf9-authentic-source-inventory/ecaz-moritani-p13-1-Im1.png` |
| Ecological Testing Station | Ecaz & Moritani, p13, Im2 | 145 × 145 | `/tmp/gf9-authentic-source-inventory/ecaz-moritani-p13-2-Im2.png` |
| Shrine | Ecaz & Moritani, p13, Im3 | 145 × 145 | `/tmp/gf9-authentic-source-inventory/ecaz-moritani-p13-3-Im3.png` |
| Orgiz Processing Station | Ecaz & Moritani, p13, Im4 | 145 × 145 | `/tmp/gf9-authentic-source-inventory/ecaz-moritani-p13-4-Im4.png` |
| Treachery Card Stash | Ecaz & Moritani, p13, Im5 | 145 × 145 | `/tmp/gf9-authentic-source-inventory/ecaz-moritani-p13-5-Im5.png` |
| Spice Stash | Ecaz & Moritani, p13, Im6 | 145 × 145 | `/tmp/gf9-authentic-source-inventory/ecaz-moritani-p13-6-Im6.png` |
| Ornithopter | Ecaz & Moritani, p13, Im7 | 145 × 145 | `/tmp/gf9-authentic-source-inventory/ecaz-moritani-p13-7-Im7.png` |

The Tech files already have original alpha, measured page placement and hashes in the page prototype's `art-manifest.json`. All three have original gear outlines. Axlotl Tanks is purple with the figure/tank glyph; Heighliners is grey-green with a vertical ship glyph; Spice Production is gold with the segmented production glyph. These are specific original illustrations, not generic circular text tokens.

Discovery fronts are original gold textured circles with black silhouettes and cream outlines. The five locations have different architectural silhouettes and the printed compact effect symbols. The three gain-and-discard tokens have crate, spice-production or ornithopter silhouettes. Their names are printed in the adjacent book descriptions, not across the token faces. Retain this distinction when reproducing them.

The original HMS is an asymmetrical green pointer shape, containing a circular black stronghold silhouette with cream outline. Destroyed Shield Wall is a wide blue irregular piece with explosion/ruin art and its original lettering. The KH counter is a green rectangle with Atreides glyph and +2. A generic round token loses the original silhouette and colour cues for each of these pieces.

## Authentic card treatment evidence

Ecaz & Moritani p12 has the original Great Maker card. The native embedded `Im1` is 361 × 475 and contains the pale mottled card body, stone frame, brown heading strip, pale type strip, large illustration panel, rules area and orange circular symbol. Its card name, type and rules text are separate PDF text, so the extracted image alone is deliberately blank in those places. This makes it a useful original layout reference, but not a complete card face.

- Image: `/tmp/gf9-authentic-source-inventory/ecaz-moritani-p12-1-Im1.png`.
- Complete original rendered page: `/Users/me/.codex/worktrees/gf9-page-prototype/dunezone/content/gf9/prototype/public/reference/ecaz-discovery.png`.
- This card is shown at a slight angle in the book. Do not treat the screenshot's skew as the intended card geometry.

Base p5 contains six authentic deck backs, 73 × 102 each, and a KH card face. The backs use the mottled dark backgrounds, cream/gold borders, concentric line work, centered emblems and lower deck names. They supply authentic treatment evidence, but not the three requested missing card faces.

The supplied CHOAM & Richese p4 explicitly states that its two updated Karama cards replace the core cards. A visual reference found later must be identified as the applicable updated card, rather than assuming every Karama scan represents the final GF9 ruleset.

## Sources that must not be mistaken for current GF9 faces

`/tmp/gf9-card-scans/Karama.gif`, `RockOutcroppings.gif`, and `SihayaRidgeDiscovery.gif` were inspected visually. They have white or flat tan backgrounds, blue repeated border glyphs, orange lettering and old diagrammatic art. They are the old card design used by treachery.online, visibly different from the illustrated GF9 cards. The Sihaya file prints a large Discovery! label and a Hiereg/Cielago East instruction in that old treatment.

These can establish a community implementation's data or offer historical comparison. They cannot establish the current GF9 original appearance. `/tmp/gf9-art-tree.txt` inventories the treachery.online repository; it also lists techtoken*.svg, discovery*.png and HMS files. The repository is cited by the canonical ticket for descriptions and rules coverage, not as an official GF9 artwork archive.

The local `/Users/me/Projects/Dune/ttsmod` is titled CODE LAB, DUNE dreamrules. Its JSON references are not evidence of GF9 card appearance.

## Source links

- [Create GF9 ruleset](https://github.com/ndelangen/dunezone/issues/2216), read with all comments.
- [Original base rulebook](https://www.gf9games.com/dunegame/wp-content/uploads/Dune-Rulebook.pdf).
- [Supplied Ixian & Tleilaxu PDF](https://github.com/user-attachments/files/33447701/BA7A5BD340F4B147740B6D25209C917D6DF2DFC0_IxianAndTleilaxuRulebook.pdf).
- [Supplied Ecaz & Moritani PDF](https://github.com/user-attachments/files/33447702/2675E24EDC2A720CCF7B969BF7DC831DD28649D9_EcazMoritani-Rulebook-LOWRES.pdf).
- [Official Ecaz & Moritani PDF](https://www.gf9games.com/dune/wp-content/uploads/EcazMoritani-Rulebook-LOWRES.pdf).
- [Supplied CHOAM & Richese PDF](https://github.com/user-attachments/files/33447703/9DD6A03F57C5F1B662DDEAD2D21B210DB2492F64_ChoamAndRichese.Rulebook.pdf).
- [treachery.online](https://github.com/ronaldossendrijver/treachery.online), community implementation.

## Extraction and review limits

The temporary references are decoded native embedded images converted to RGBA PNG for inspection. No generated imagery or enlargement was used. Some Ecaz images have CMYK colour and soft masks whose dimensions differ from the image. Pypdf reports these mismatches. A final faithful extraction must preserve the PDF's compositing, through a rendered crop or a verified mask conversion. Do not silently promote these diagnostic square images as final transparent discs.

Original sources are low resolution in several places. Using their art in a vector or 600-pixel publication does not create additional detail. A good next proof would place the actual original references beside the proposed maintained renderer output at matching screen and print sizes. When an exact face is still missing, label that gap and obtain a current physical-card photo or another verified source before choosing its illustration.

The earlier CHOAM emblem finding is superseded by the user's decision. CHOAM intentionally has no logo and uses its red/black background. Richese has no split background. Wider faction-head crops are accepted and are not reopened by this investigation.
