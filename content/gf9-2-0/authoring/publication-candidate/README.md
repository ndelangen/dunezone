# GF9 2.0 publication candidate

Prepared on 25 October 2026, then applied after the user explicitly approved this administrative scope. Edition 2 is now published from revision 9. See [the release record](../published-edition-2.md). The sections below retain the original preparation and recovery details.

## Corrections

The board page now shows the existing Spice Blow symbol at a readable size. Short explanations distinguish a territory from a sector and longitude lines, and identify the Round Track, Tleilaxu Tanks, Spice Bank and player circles on the physical board. Original rule paragraphs remain intact. Only digital page 7 changes; the other 60 pages remain identical to revision 8.

Solaris and Family Atomics have fitted candidates using the existing custom-card renderer and conversion. Their artwork, dimensions and complete wording remain unchanged. The existing 499-pixel text area uses 36-pixel Candara for Solaris and 33-pixel Candara for Family Atomics, reduced from 40. Neither candidate clips. No new asset records, artwork or Block type are proposed.

## Verification

The raw Rulebook schema and reference checks pass. All 971 source units remain accounted for. All 61 candidate page regions fit, with no unloaded images. The two candidate card images were substituted only in the local review browser. These checks do not claim that the fitted images are deployed.

[Focused checks](focused-checks.json) record the two text regions and board page. [Whole-book checks](book-checks.json) record all 61 pages. The two card candidates and the revised board page were also inspected visually.

## Production application

[The exact plan](production-plan.json) names the deployment, Central identity, Rulebook and two existing card IDs, before and after card data, expected revision, operations and recovery. The normal browser controls are unavailable in this session. Applying the plan through Convex CLI would therefore be administrative production writes and requires the confirmation specified in the repository's AGENTS.md.

The existing card conversion is administrator-only and changes their catalogue type from treachery card to custom card. IDs, owners and references survive, and old addresses redirect. There is no normal UI reverse conversion. Original data and the revision 8 book are backed up here. The plan proposes no change to account records or permissions and no new server function.

The existing conversion currently rejects the optional bodyLayout field on these live cards. Removing that field first leaves the existing illustrated presentation unchanged and allows the existing conversion to validate. All card wording is preserved exactly.

After the card publications are verified, save the local manuscript as the next draft revision, verify it, and publish Edition 2. Keep issue #2431 open for the separate differences book.
