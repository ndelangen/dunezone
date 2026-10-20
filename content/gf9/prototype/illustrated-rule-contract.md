# Illustrated rules beside component images

The user selected C as the composition base, with images near the text that uses them. They supplied a GF9 example with a card on the right and rules flowing beside it. This is a reusable authoring pattern rather than a page-specific arrangement of paragraphs.

## Reuse the existing Blocks

Card entry already accepts a general component source, an optional name, formatted text, quantity and small/medium/large illustration size. Its current renderer uses a fixed image-left, text-right grid. Illustrated inventory already pairs multiple component sources with their individual explanations. Asset explainer serves a different purpose, placing numbered annotations on an image.

Use Illustrated inventory for the three Tech Tokens. Each token's image, name, starting holder and income trigger belong in one item. Put shared income and victory rules outside that collection. Readers should not need to match a distant gallery to a list by memory.

Extend Card entry for a single illustrated rule. Avoid a second Block with the same source/name/text contract. The exact writable contract belongs in [Choose the local GF9 authoring source of truth](https://github.com/ndelangen/dunezone/issues/2363). The implementation direction is:

| Control | Values | Omitted/default behavior |
| --- | --- | --- |
| Image side | Left or right | Left, preserving current rendering |
| Text flow | Beside or wrap | Beside, preserving the current grid |
| Image size | Existing small, medium or large | Preserve current size behavior |

In wrap mode, text begins beside the image and returns to the full Block width below it. Keep the image's aspect ratio and component source binding. Do not introduce image pixel coordinates, paragraph coordinates, a canvas editor or page-specific selector controls. A heading and the prose remain part of the same ordered Block. No change to rules text is needed to switch presentation.

The prototype demonstrates image-right wrap using scoped CSS. It does not add these controls to production schemas or editors. Optional controls must eventually travel through draft parsing, saved content, Edition snapshots, render projection and raw JSON Load. Old saved Blocks must retain their current result without a data backfill. Unsupported new fields must not be silently dropped during a round trip.

## Acceptance for implementation

Verify left/right and beside/wrap with a card and a non-card component, short and long prose, and the square and narrow book widths. Keep the explanation adjacent to the image, readable at physical size, with no clipping or overlap in reader HTML or PDFs. Preserve source names or meaningful alternative text, unavailable-source behavior and reference identity. Add a continuation Page when the content does not fit rather than reducing the body type or hiding overflow.

The user's four accepted covers remain fixed and outside the next review. The focused review covers the changed text/image pairing and movement explanation, not a fresh approval of the whole sample pack.
