# GF9 2019 to GF9 2.0 differences dossier

Prepared on 26 October 2026 for a second rulebook under GF9 2.0. Its audience already knows the earlier GF9 game. The eventual book should explain what changes in play, with examples where an old habit gives the wrong result. It should not repeat the unchanged game.

A [37-page local teaching draft](authoring/README.md) is now available for review. It uses existing Blocks and production artwork, with unresolved wording and expansion announcements labeled. The faithful reconstruction remains a separate book.

## Baselines

The primary comparison is the official 2019 GF9 base game against the supplied 2026 second-edition rulebook. Basic and Advanced are identified separately. The November 2020 official FAQ is another layer, since several apparent new rules were already clarified there.

Our current published GF9 books are the practical comparison for Dune Zone readers. They contain FAQ clarifications and adopted judgements, so they are not exact copies of the 2019 printing. A new explicit rule that reverses one of those judgements is identified as such.

| Source | Pinned publication read | Digital pages |
| --- | --- | ---: |
| [Dune: core rules](https://dune.zone/rulesets/gf9/rulebooks/dune-core-rules?edition=2) | Dune Zone publication Edition 2, 21 October 2026 | 50 |
| [Ixians & Tleilaxu](https://dune.zone/rulesets/gf9/rulebooks/ixians-tleilaxu?edition=2) | Dune Zone publication Edition 2, 21 October 2026 | 31 |
| [CHOAM & Richese](https://dune.zone/rulesets/gf9/rulebooks/choam-richese?edition=2) | Dune Zone publication Edition 2, 21 October 2026 | 39 |
| [Ecaz & Moritani](https://dune.zone/rulesets/gf9/rulebooks/ecaz-moritani?edition=2) | Dune Zone publication Edition 2, 21 October 2026 | 65 |
| [GF9 2.0 Rulebook](https://dune.zone/rulesets/gf9-2-0/rulebooks/gf9-2-0-rulebook?edition=3) | Dune Zone publication Edition 3, 25 October 2026 | 61 |

These publication Edition numbers identify saved website versions. They do not rename the 2019 or 2026 game editions. The live 2.0 book had advanced to publication Edition 3 when this research began; the comparison uses that edition.

The [source ledger](sources.json) records source hashes, pinned artifact URLs and all 246 digital page locators. It also identifies the original base PDF, the official FAQ and three original expansion PDFs. The newer source PDF has 36 pages. Source references count PDF pages from the cover; digital pages are labeled separately. The reworked transcript is a reading aid. Clearer-scan corrections and the checked printed artwork take precedence over its old uncertain readings.

## Research files

| File | Contents |
| --- | --- |
| [Core procedures](core.md) | Setup, all nine phases, combat, victory, alliances, deals, privacy and notes. Each finding compares printed sources and our live baseline. |
| [Base factions](factions.md) | Setup, rosters, abilities, alliances, cancellation targets and special Karama powers for all six factions. |
| [Cards, decks and names](cards.md) | Card changes, paired Spice locations and amounts, Storm deck, optional variants, name mappings and physical inventory differences. |
| [Expansion compatibility](expansions.md) | Six announced expansion-faction changes and eleven compatibility checks. This is not a complete twelve-faction conversion. |
| [Community reading](community.md) | Nine BGG threads and five Reddit threads, with designer statements separated from opinions and requests. |
| [Source coverage](coverage.md) | All 36 new source pages, comparison topics and stated reading limits. |
| [Finding index](index.json) | Stable research IDs, classification, overlap links and the document containing the evidence. Cross-topic entries are not counted as separate changes. |
| [Research review](review.md) | Cross-checks and corrected draft claims. |
| [Open questions](questions.md) | Source contradictions and missing evidence, separated from confirmed changes. |
| [Community source ledger](community-sources.json) | Full BGG post counts, direct post URLs, dates and response hashes, plus Reddit reading limits. |

The BGG reading includes [the designer thread supplied by the user](https://boardgamegeek.com/thread/3785979/dune-2ed-vs-kwisatz-what-is-what), all 14 posts. Across the nine BGG threads, all 79 posts returned by the first-party public API were read and matched the metadata counts. Five Reddit original posts and their displayed comment sections were read; collapsed replies mean that is not a claim to every nested comment. The report links the particular comments or posts used.

## What the differences book needs to explain

This is a content inventory, not a proposed page layout.

| Topic | Veteran habit to replace or check | Evidence |
| --- | --- | --- |
| Default game | Calling the new game simply Advanced misses changed combat, deck operation and faction exceptions. Basic veterans have a different starting point. | CORE-C01, CORE-C14, CORE-C18 |
| Setup and map | Initial hand before traitor choice, changed starting resources and Guild deployment, updated leader values and names, new blow locations and amounts. | CORE-C02, faction records, DECK-02, TERM-02 |
| Storm and Spice | Always using the Storm deck, reading its reshuffle/dial instructions, resolving one paired blow card, distinguishing Little Maker from a worm, and fighting in a shared protected storm sector. | CORE-C04-C07, DECK-01-DECK-04 |
| Combat and revival | Full force strength plus a separate spice tier, payment and losses, information kept secret, revival unlock instead of cycling, earlier leaders exposed to later explosions, and the Fremen/Emperor adjustments. | CORE-C08-C13 and faction records |
| Karama and Solaris | Only the named advantage is cancelable. Economics move to Solaris. Free bank payment is different from receiving Guild income, and still needs the proper force threshold. | CARD-01-CARD-04 and the six-faction target table |
| Other card habits | No unaffordable bluff bids, Truthtrance about information, mandatory Worthless disposal, multiple starred revivals through Ghola, and storm-order card timing. | CARD-03, CARD-05-CARD-08 |
| Allies and negotiation | New evacuation burden and reserves outcome, Emperor payment windows, advisor coexistence, binding versus nonbinding deals, visible private exchanges, and the notes/phase restrictions. | CORE-C17-C21, faction records, CORE-U02 |
| Winning | The revised Guild special condition, competing-winner hierarchy and round-ten fallback. The ordinary 3/4 stronghold targets remain familiar. | CORE-C15-C16, CORE-Q17, faction records |
| Optional rules | Classic Spice Dialing restores old support arithmetic; Spirit World changes access to one-time powers. Neither is the new default combat. | VAR-01-VAR-02 |

Each eventual lesson needs an earlier behavior, the new behavior, a concrete consequence and links to the applicable sources. Use a Basic label only where that baseline differs from Advanced. Add a Dune Zone clarification note where our older published book already resolves an apparent novelty. Do not turn every new glossary entry into a mechanical change.

## Examples worth preparing next

- Four ordinary committed forces with zero spice, then with four spice. Compare Basic, old Advanced and new default results without changing the opposing plan.
- One Sardaukar at a spice threshold. Distinguish dialed strength from token count and from spice strength when taking losses.
- A paired Spice Blow followed by Shai-Hulud, contrasted with Little Maker. Show the discard history rather than two old Advanced piles.
- A former Karama economic play using Solaris, including why an unaffordable bluff bid is no longer legal.
- An Emperor ally during bidding, compared with an end-of-phase gift and the new combat discount.
- A newly allied pair sharing a territory, with the first mover unable to leave. Distinguish reserves from the Tanks and advisors from fighters.
- A valuable leader dying again after revival, and a survivor of an earlier battle caught in a later lasgun/shield explosion.
- Round ten with Guild tied for strongholds, then a case where Guild trails. Keep special conditions separate from generic fallback ranking.

These are candidate teaching situations derived from the rules and the community's recurring questions. Their final wording must preserve the unresolved source issues in [questions.md](questions.md). They are not promises about balance or speed of play.

## Scope that remains provisional

The six base factions can be compared from complete old and new rulebooks. Full second-edition expansion sheets, decks and module procedures were not supplied or obtained. Publisher announcements establish that changes exist; they do not supply every number, timing rule or interaction needed for a twelve-faction conversion.

[Jack Reda's compatibility reply](https://boardgamegeek.com/thread/3785979/article/48320615#48320615) explicitly says old expansions were not designed for complete compatibility. Keep the announced changes and compatibility checklist as a clearly labeled appendix until the revised sources are available. That source gap does not prevent preparing the confirmed base-game differences.

The reading is complete for the source sections named in the research reports, with targeted visual checks of critical PDF wording and artwork. It is not a certified word-for-word comparison of every miniature label or every historical printing. Community discussion is a discovery and teaching aid; printed rules and direct designer statements determine what the dossier treats as confirmed.
