# First corrections after the page review

Saved production draft revision 8 on 24 October 2026 through the normal authenticated editor as Central. The book still has 61 Square pages. No new Edition was published.

## Changes

| Finding | Digital page | Saved correction |
| --- | --- | --- |
| R2 | 18 | The board crop now identifies cities granting ornithopter access. The caption explains that aircraft symbols identify them on the printed board. |
| R3 | 25 | Both native wheels use the existing second-edition strength-3 Duncan Idaho token. The left caption explains 6 force strength, 4 spice and +2 spice strength. The right caption explicitly identifies a comparison without spice. The source leader's name is cropped, so the selected token represents its visible strength rather than claiming to identify its portrait. |
| R4 | 30 | Named annotations give Arrakeen and Carthag carryalls and 2 spice stronghold income each. Tuek's Sietch has 1 spice stronghold income. |
| R5, meaning restored | 38 | The existing card-entry explanation now repeats the complete printed option, "Pay for spice strength in battle from the Spice Bank." The published card image still clips this option. |
| M1 | 1 | The existing cover supporting-text field restores both framing lines. The approved artwork is unchanged. |

Only these five pages changed. Page order, pagination, source wording elsewhere and the other 56 pages remain identical to revision 7. All changes use existing Blocks and production assets. No application code or asset records changed.

## Verification

The builder passes the raw Rulebook schema and reference checks. It accounts for all 971 source units and finds no uncertainty markers. The manuscript remains within the JSON Load limit.

The five changed pages were inspected in the local renderer and then in the production editor. A local Solaris image was still loading during capture; production verification confirmed every referenced image loaded. All changed production page regions fit without overflow. The strength-3 numeral is visible on the production leader token.

After Save, a reload showed draft revision 8. A fresh authenticated JSON download exactly matches the local settings and contents. [The saved export](production-draft-export.json) records that result. [Revision 7 backup](correction/before-easy-fixes-r7.json) can be loaded through the same editor to restore the previous draft.

## Remaining work

- R1: replace the bare board-feature names with useful markers and explanations. This needs a composition pass.
- R5 illustration: fit the complete Solaris wording inside its existing published card image. Its missing meaning is now readable in the rulebook text.
- M2: fit the complete Family Atomics wording inside its existing published card image.
- Verify the remaining corrections, finish the faithful book and settle publication.
- Prepare the separate differences rulebook with its earlier-edition baseline and citations.

[The revision 7 audit](page-by-page-review-r7.md) remains unchanged as evidence of what the independent reviewers saw. This note records the subsequent corrections.
