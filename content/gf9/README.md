# GF9 content

This directory holds the locally authored content for the existing [GF9 Ruleset](https://dune.zone/rulesets/gf9) and [GF9 Group](https://dune.zone/groups/gf9). The scope is the 2019 GF9 game in Basic and Advanced play, all twelve factions, and the Ixians & Tleilaxu, CHOAM & Richese, and Ecaz & Moritani expansions. The companion books cover Tech Tokens, Leader Skills, Stronghold Cards, Nexus Cards, Homeworlds and Discovery Tokens.

The public source ticket used for this delivery is [Create GF9 ruleset, #2216](https://github.com/ndelangen/dunezone/issues/2216). Contradictions and adopted interpretations belong in [GF9 judgements, #2352](https://github.com/ndelangen/dunezone/issues/2352). Application limitations belong in [DuneZone GF9 missing features, #2353](https://github.com/ndelangen/dunezone/issues/2353).

The requested Discord creation ticket could not be located. The private browser session was signed out; the other browser session used a different Discord account. The native app had the intended Central account. Its Dreamrules posts confirmed the FAQ dataset and its link to #2284. The creation-week GF9 and ruleset search results were read in full in Dreamrules and Dune Tabletop, but did not identify a creation ticket. The GitHub ticket and all its supplied PDFs were read; the Discord and GitHub tickets have not been established as the same record.

## Authoring and build

- `*-manuscript.json`: four teaching manuscripts, with applicability and source references on each section. Edit these before rebuilding the rulebook data.
- `base-factions.json`: six original factions in the shared faction input shape.
- `expansion-factions.json`: six expansion faction drafts, completed by the assembler with stable component IDs and existing illustration references.
- `assets-package.json`: curated asset input, including decks and their member quantities. Its provenance and inventory are recorded in `assets-source-manifest.json`.
- `core-judgements.json` and `expansion-judgements.json`: local evidence and decisions for the GitHub judgement ledger.
- `core-coverage.json`, `expansion-coverage.json`, both `faq-review*.json` files and `asset-review.json`: reading and content-review evidence. Review evidence is distinct from rendering or production verification.
- `*-rules.json`, `rulebooks-package.json`, `package.json` and `portrait-provenance.json`: generated outputs. Rebuild rather than editing them directly.

From the repository root, with the repository dependencies installed:

```sh
bun run content:gf9:build
```

The script compiles and paginates the four manuscripts, then validates the shared import contracts, assembles assets, twelve factions and four rulebooks, recalculates faction complexity, checks twenty forces per faction, binds dependent records, and writes `package.json`. It finishes with the repository's formatter. It does not write to production. The asset package is a curated input; there is no checked-in command that recreates it from remote sources.

Import through the authenticated application flow into the existing GF9 Ruleset and assign every associated record to the existing GF9 Group. Preview and review creates, updates, record reuse and bindings before applying. Existing stock reuse must preserve other Ruleset associations. A successful local build proves data shape and references; inspect the resulting HTML, cards, faction sheets and every PDF page before publication. Production import and publication evidence is tracked by the delivery task.

## Sources and precedence

All six supplied PDFs were read in full, as was the mirrored base rulebook: 163 PDF pages in total, including overlapping rules and repeated FAQ material. This is a count of source pages read, not the length of the authored books.

Use the applicable official rule and card edition first. An explicit official correction or replacement controls the text it corrects. A more specific expansion procedure controls its interaction with a general base procedure. Read designer explanations in context, including later corrections to earlier explanations. A date alone does not make an older FAQ answer override an expansion published afterward. Community compilations and software implementations help expose gaps, inventories and contradictions; their house rules require a recorded decision before adoption.

The two unofficial compilations contain intentional changes and repeated answers that disagree. The revised PDF filename says v2.3 while its internal heading says Version 2.2. Its outlined text identifies unofficial changes. Preserve that version discrepancy when citing it.

Numeric page references mean PDF pages counted from the cover as page 1. The revised compilation's printed page number is two less than its PDF page. A named page reference identifies a section or source-code location instead. The source legend at the end of each authored book explains these short keys.

| Key | Source and copy read | PDF pages | SHA-256 |
| --- | --- | ---: | --- |
| `gf9-base-2019` | [Dune Rulebook, Gale Force Nine, 2019](https://raw.githubusercontent.com/ronaldossendrijver/treachery.online/master/Client/wwwroot/docs/Dune-Rulebook.pdf) | 24 | `6c55d28e93b6948a34d20b0f50e1087494e06f237f8c43e7e4c0cac3810b752d` |
| `gf9-ixian-tleilaxu / ixian-tleilaxu` | [Dune: Ixians & Tleilaxu, Gale Force Nine, 2020](https://github.com/user-attachments/files/33447701/BA7A5BD340F4B147740B6D25209C917D6DF2DFC0_IxianAndTleilaxuRulebook.pdf) | 12 | `9dc631968839d6e8935acb30ac301301cfea7ed07a78a3aac266648f21cf357d` |
| `gf9-choam-richese / choam-richese` | [Dune: CHOAM & Richese, Gale Force Nine, supplied 2021 rulebook](https://github.com/user-attachments/files/33447703/9DD6A03F57C5F1B662DDEAD2D21B210DB2492F64_ChoamAndRichese.Rulebook.pdf) | 12 | `ee08ac180ca9824728532212bbd54de3e258ed81ad30051063f5633928fb7407` |
| `gf9-ecaz-moritani / ecaz-moritani` | [Dune: Ecaz & Moritani, Gale Force Nine, supplied rulebook with 2022 copyright](https://github.com/user-attachments/files/33447702/2675E24EDC2A720CCF7B969BF7DC831DD28649D9_EcazMoritani-Rulebook-LOWRES.pdf) | 16 | `196101a82769fd40dca308f5fb8fa3a322321e72b9eb813c255c2e3a24f981a9` |
| `gf9-faq-2020-11 / faq-nov2020` | [Dune Questions and Answers, Gale Force Nine, November 2020](https://github.com/user-attachments/files/33447700/Dune-FAQ-Nov-2020.pdf) | 9 | `b6dc77d7778fb0fee800e3995e6fbf620531f7a6b1fd32af2303266f60bf2039` |
| `revised-v2.3` | [Unofficial Revised Dune Rulebook, Van Willis; filename v2.3, internal heading Version 2.2](https://github.com/user-attachments/files/33447699/UNOFFICIAL_Revised_Dune_Rulebook_v.2.3_web.pdf) | 44 | `7077aa87a973221d86d4bd2da945b40c4dec3d371caa6a68cb209758ddf1e516` |
| `compilation` | [Dune Boardgame Rules Compilation, Johannes Cassebaum / Dune Tabletop Discord; undated supplied copy](https://github.com/user-attachments/files/33447704/DuneBoardgame-RulesCompilation-Pages.pdf) | 46 | `990ed406120dd5d90c256a2afb3917247452d5c2025393c063ed8ba8e7b393f3` |

The base copy was read from Treachery.online's repository mirror. Direct retrieval of the official base URL and the linked official CHOAM & Richese URL returned HTTP 403 during research; the supplied attachment was used for CHOAM & Richese. The November FAQ was read from the supplied attachment. This does not establish the current availability or identity of every official website copy.

## FAQ coverage and exclusion

The [GF9 FAQ issue, #2284](https://github.com/ndelangen/dunezone/issues/2284) supplied 402 collected comments. Two reviewers read all entries: indices 0–199 in `faq-review.json`, and 200–401 in `faq-review-200-401.json`. The combined index set is exactly 0–401 with no gaps or duplicates. The captured issue JSON used for that audit had SHA-256 `2f09f8c76d828c0b878c99e9f414cd0045d13193d37135094fbf7a835cbd4731`.

The user explicitly excluded FAQ items. No FAQ question-and-answer section or FAQ application records are part of this package. Settled clarifications inform ordinary procedural rule text. Review files record exclusions, corrections and judgements rather than treating every community answer as an official rule.

Two collected questions have no supplied special answer: Auditor versus Prescience (index 233) and worm destruction under a storm (index 349). The manuscript uses the stated ordinary rules without inventing an exception. Unofficial penalty procedures, unrestricted trading toggles and tournament-only conventions remain outside the GF9 default. Historical FAQ versions quoted in the collected issue were read there; separate October 2019 and April 2020 PDF copies were not obtained. The supplied November 2020 PDF was read in full.

Per the user's correction, the already collected FAQ citations were trusted and read rather than rechecked online. This review does not certify every historical remote link or establish that the supplied collection contains every ruling ever issued.

## Adopted choices

The judgement files give source statements, the selected rule, the reason, confidence and affected content. Material decisions include:

- A Karama cancels one use of an ability. Cancellation of Guild's turn-timing advantage requires its normal storm-order turn. Special Karama powers cannot themselves be cancelled by an ordinary Karama.
- Resolve each Advanced spice discard pile fully, including that pile's Nexus and Fremen ride, before the next pile. The Fremen special Karama has its separately stated end-of-phase Nexus timing.
- Leaders that survived an earlier battle and remain beside a territory as use markers are not killed by a later lasgun/shield explosion. This follows the collected designer correction to the earlier interpretation.
- Retain official ally restrictions, the conditional Advanced Fremen Storm Deck and the official Emperor allied-payment interaction. Do not substitute the Dynamic Rulebook's house changes.
- Ecaz Occupy uses the explicit rule's rounding: five Ecaz forces add three strength and leave two on a win. The conflicting worked example reverses both roundings.
- Salusa Secundus retains its current side at exactly two Sardaukar. Its overlapping thresholds express a state transition, not a single stateless comparison. Richese's High threshold is eleven.
- Existing Nexus stock follows the supplied 2022 scans and the recorded #2071 choice: preserve Fremen's three-free-revival text and the Richese Secret Ally text even where that text duplicates another faction's card. Differences remain visible in the ledger.
- Updated Poison Tooth, Artillery Strike and the two base Karama cards replace earlier editions. The extra Richese-cache Karama remains a separate cache member. The main Treachery Deck has 50 physical cards: base 33, first expansion 14, final expansion 3; the ten-card Richese cache is separate.

Independent core review is recorded per judgement. Medium-confidence choices remain interpretations where the supplied evidence does not settle every detail; review does not turn them into new official errata.

## Linked-source inventory

This table distinguishes reading from runtime testing. It covers the direct resources in #2216 and its source comments. The broader project index is navigation context rather than an instruction to recursively audit every linked repository.

| Resource | Material read and access result | Use |
| --- | --- | --- |
| [Dune Dynamic Rulebook repository](https://github.com/LironCareto/DuneDynamicRulebook) and [live rulebook](https://lironcareto.github.io/DuneDynamicRulebook/) | README and the complete HTML rule text, including all faction sheets, variants, errata and embedded Q&A; 21,520 extracted words. Live retrieval failed through the research browser, so the repository HTML at `c8f8110448e7941ee3bedf360ddbde52a212979f` was read. | Presentation and comparison only. It deliberately changes alliance restrictions, Storm Deck use, Emperor payments and some victory rules. Its fourth-worm Shield Wall destruction and synthetic illegal-plan correction are also excluded. |
| [Dune Battle Wheel repository](https://github.com/LironCareto/DuneBattleWheel) and [live tool](https://lironcareto.github.io/DuneBattleWheel/) | Project README and documented faction/calculation scope read. Complete application source and interactive calculation behavior were not audited. | Presentation inspiration, not a rule authority or validation oracle. |
| [Unofficial Revised Rulebook BGG listing](https://boardgamegeek.com/filepage/196513/unofficial-revised-dune-rulebook-v23) | The corresponding supplied 44-page PDF was read in full. The listing itself was not retrieved. | Unofficial cross-reference with the version caveat above. |
| [Luis Civolani's Dune: How to play](https://luiscivolani.com/dune#tokens) | Read through the in-app browser on 20 October 2026 after research retrieval returned HTTP 403. Read the full Basic and Advanced page text, all nine phase panels in each mode, six faction sheets in each mode and all seven expansion accordions in each mode. No revision date is displayed. KISS mode and the quiz were outside this reading scope. See `teaching-reference-review.json`. | Teaching and interaction inspiration only. Short summaries omit conditions and sometimes conflict with the source-backed manuscript; no mechanics were changed from this guide. |
| [Dune Bench](https://github.com/ralfboltshauser/dune-bench) | README and its numbered-rule/coverage approach read at `3deecf5f4fe06966a824eea7fe9a1d81fa117c5c`. The whole engine and test suite were not audited. | Coverage inspiration; implementation choices do not replace GF9 sources. |
| [Dune Combat Calculator](https://www.dunecombatcalculator.com/), [original repository](https://github.com/Erelyks/dune-combat-calculator) and [expanded fork](https://github.com/davidscheele/dune-combat-calculator) | Both READMEs and the complete fetched public page text read. Interactive calculations and full JavaScript implementations were not audited. | Combat presentation, faction options and explanatory labels. |
| [Treachery.online repository](https://github.com/ronaldossendrijver/treachery.online) | Relevant card/token text, faction descriptions, enumerations, deck construction and Homeworld definitions examined, plus the base PDF mirror. The asset review records file locations and hashes. Research snapshot: `8f1edba2122c0f835ed61d47ee20cd9f71ad56ce`. | Inventory and card data cross-checked against printed sources and collected rulings; optional engine rules excluded. |
| [Community project index, #2233](https://github.com/ndelangen/dunezone/issues/2233) | Full issue body read. | Navigation and creator credits. Its separate lore, bot and asset-generation projects are outside this ruleset source audit. |
| [WBC 2025](http://www.boardgamers.org/wbc25/Previews/dun.html), [Landsraad rules](https://www.landsraad-vegas.com/rules), KISS and future KH edition | Collected references read where included in the FAQ issue; standalone rule sets were not imported or fully read. The ticket says the KISS v0.3 PDF was not supplied online. | Explicitly separate rulesets, outside the current GF9 goal. |

## Artwork and stock provenance

Faction rules were authored from GF9 sources. Existing Dune Zone illustration IDs were reused from checked-in faction fixtures; those fixtures supplied artwork references, not Dreamrules mechanics. The assembler uses existing logos, textures and illustrations. `portrait-provenance.json` records the anonymous existing leader illustration used to represent Count Ilban Richese and Ur-Director Malina Aru; these are not official portraits of those characters.

`assets-source-manifest.json` records source locations and SHA-256 fingerprints for the curated assets. `asset-review.json` records the independent 235-item content review, printed Homeworld face comparisons, corrected copy, inventory checks and data-hash checks. Generated faction outputs supply force tokens, leaders, traitors, Alliance Cards and shields; explicit Prediction Cards and the shared Duke Vidal token fill the component gaps documented there.

An existing stock asset may be reused only within the delivery task's verified ownership and approved scope. In particular, adoption of the existing Arrakis board preserves its other Ruleset links. No new artwork was generated as part of this source-authoring pass. Source provenance is not a new licence grant for GF9 text, trademarks or artwork.
