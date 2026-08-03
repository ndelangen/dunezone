# Atreides Treachery-card tracker landscape

Research snapshot: 2026-08-03

## Research question

What existing tools help an Atreides player track Treachery-card knowledge in the classic Dune board game, what do they actually support, and where could a future Dune Zone tracker be meaningfully better?

This review uses the tools themselves, their first-party source repositories or documentation, and the publisher's rules material. It does not treat community roundups as evidence.

## Why the tracker exists

In the Gale Force Nine game, Atreides may inspect each Treachery Card as it comes up for purchase and may keep written records about cards. That turns card ownership into a changing information problem: cards begin unknown in players' hands, are revealed during bidding or play, move between hands, reach a discard pile, and can re-enter the draw deck. Harkonnen's extra unknown draw and later card-exchange effects are especially awkward to represent. The official product is the [GF9/Battlefront Classic Dune game](https://www.battlefrontgroup.com/gf9-games/dune/classic-dune); the publisher's former [classic rulebook URL](https://www.gf9games.com/dunegame/wp-content/uploads/Dune-Rulebook.pdf) now redirects to the publisher's new site, so the future planning map should confirm the current authoritative rulebook/FAQ URLs before implementation.

## Landscape at a glance

| Tool | Form | Verified card/faction scope | State, offline, sharing/export | Distinctive strengths | Important gaps |
| --- | --- | --- | --- | --- | --- |
| [Thufir](https://thufir.app/) | Mobile-first web app/PWA | Twelve selectable factions; base deck plus Ixians & Tleilaxu and Ecaz & Moritani card data. CHOAM & Richese is selectable, but the current card catalogue exposes no Richese cache cards. | Game and saved names in `localStorage`; installable portrait PWA; service worker caches core routes and later successful GETs. No observed game export or multi-device sync. | Fast bidding flow, player names, automatic unknown starting cards, Harkonnen hidden-card prompt, deck/discard/intel views, undo after removal. | No observed account/share flow; Richese cards absent; the source-visible deck composition should be audited because its five base Shields and five base Snoopers appear to fold expansion copies into the base count. |
| [Treachery Tracker](https://treacherytracker.com/) | Responsive web app | All twelve GF9 factions; base game plus Ixians & Tleilaxu, CHOAM & Richese, and Ecaz & Moritani; sixty individually modelled card instances including Richese cards. | Automatic `localStorage`; download/upload a JSON save file. No service worker or install manifest observed. | Most complete explicit location model: deck, player, discard, removed/revealed unknowns; Harkonnen/Ixian unknown-card handling; hand limits; notes; save/load. | Interaction is card-catalogue-first and comparatively dense. No live collaboration or account sync. Data is embedded in UI classes rather than selected from a ruleset/version registry. |
| [Dune Tracker](https://dune-tracker.com/) | Phone-optimized web app | Twelve factions and a broad unique-card catalogue spanning base, expansion, and Richese cards. | Up to ten compressed games in `localStorage`; share selected known cards through a compact URL/reveal screen. No manifest or service worker observed. | Very fast mobile UI, explicit unknown-card counts, reveal/reassign/discard actions, information-selling flow, card images, combat calculator, Mentat/FAQ material. | The observable state keys assignments by card type and stores a unique list of holder factions, so it cannot distinguish two copies of the same card type held by one faction. No full-game collaboration or export observed. |
| [Atreides Mentat](https://ohgoditspotato.github.io/atreides_mentat/) | Open-source responsive PWA | GF9 2019 base game and the Ixians & Tleilaxu Treachery expansion; eight factions total. | Redux state persisted to browser storage; installable/offline PWA; up to 50 undo snapshots. No export or sharing. | Strong deduction-oriented model: unknown cards remember the deck epoch they came from, leaving a bounded set of possible identities after reshuffles. Explicitly shows remaining-card possibilities and discards. | Source explicitly says deck tracking does not handle the Harkonnen card-swap ability; no later GF9 expansions, player names, sync, or export. |
| [Dune Companion](https://dune.how/) | All-in-one single-page companion with PWA manifest | Twelve factions; category/count-based base deck, expansion cards, Richese cards, and Landsraad-specific Richese substitutions. | Large game state in `localStorage`; QR/link shares selected factions and rule toggles, not the live hidden-information state. A manifest exists, but no service worker was found at the conventional path. | Combines tracker, battle wheel, cheat sheet, phase flow, spice, traitors, notes, card previews, and faction/rule configuration. | It explicitly warns that Atreides is not entitled to all tracked information. Category-level base cards lose individual identity, and the broad companion surface is slower to operate than a dedicated bidding tool. |
| [Dune: Atreides Card Tracker](https://steamcommunity.com/sharedfiles/filedetails/?id=1971922932) | Tabletop Simulator object/global UI | Six default seats, prepared for purple/teal expansion seats; card set is tied to the host TTS mod. | Exists inside a TTS save/mod; Atreides-only visibility. No standalone/mobile/offline/export behavior. | Lives at the online table and preserves hidden information. Family Atomics is the one enforced special case. | Its author describes it as having “almost no smarts”; impossible states are allowed, seats/factions are hard-coded, and installation requires copying the object, Global UI, and custom assets. |
| [Atreides Treachery Cards Tracker — Both Expansions](https://boardgamegeek.com/filepage/246052/atreides-treachery-cards-tracker-both-expansions) | Printable PDF/XLSX | Base game plus the first two GF9 expansions available when published; marks Richese cards and gives base/expanded counts. | Print, pencil, or laminate/dry-erase; naturally offline; no validation, persistence beyond the sheet, or sharing. | Fast, legible, edition-aware physical aid that fits the box. | Static six-column ownership/discard grid; no deductions, ruleset switching during play, or automatic handling of card movement. |

## Verified implementation observations

### Thufir

The live app publishes readable first-party browser modules. Its [faction data](https://thufir.app/assets/data/factions-2295b1c8.js) defines all twelve GF9 factions and three expansion toggles. Its [card catalogue and deck composition](https://thufir.app/assets/data/cards-2f35424b.js) model named card types, copy counts, descriptions, images, and expansion provenance. The [game controller](https://thufir.app/assets/controllers/game_controller-3bf8dcbf.js) stores player-scoped card events in `localStorage`, adds an unknown card after a known Harkonnen assignment, and uses timestamps to identify assignments. The [manifest](https://thufir.app/manifest.json) and [service worker](https://thufir.app/service-worker) verify installable/offline behavior.

The interaction is deliberately event-shaped: identify the card currently up for bid, assign it to a named player, then inspect hands or the remaining deck. This is the best observed pattern for minimizing table delay.

### Treachery Tracker

The app is open source at [CamHowling/DuneAtreides](https://github.com/CamHowling/DuneAtreides). The pinned snapshot reviewed here is commit [`ca6be16`](https://github.com/CamHowling/DuneAtreides/tree/ca6be16a97422279670af7d497dba2a7524b42ad). Its [`Treachery` model](https://github.com/CamHowling/DuneAtreides/blob/ca6be16a97422279670af7d497dba2a7524b42ad/src/classes/treachery.ts) gives every physical card instance an ID plus category, expansion memberships, location, holder, and auction/CHOAM/share flags. Its [`UnknownTreachery` model](https://github.com/CamHowling/DuneAtreides/blob/ca6be16a97422279670af7d497dba2a7524b42ad/src/classes/unknownTreachery.ts) separately tracks origin faction, current holder, location, and visibility. [`newgame.tsx`](https://github.com/CamHowling/DuneAtreides/blob/ca6be16a97422279670af7d497dba2a7524b42ad/src/pages/newgame.tsx) derives the card pool from selected expansion IDs, creates starting unknowns, and persists cards, players, unknowns, and notes locally. [`optionsMenu.tsx`](https://github.com/CamHowling/DuneAtreides/blob/ca6be16a97422279670af7d497dba2a7524b42ad/src/components/tracker/optionsMenu.tsx) and [`loadGame.tsx`](https://github.com/CamHowling/DuneAtreides/blob/ca6be16a97422279670af7d497dba2a7524b42ad/src/components/tracker/loadGame.tsx) implement JSON download/upload.

This is the strongest observed physical-card state model. Its main cost is interaction weight: the same explicitness that makes it complete makes routine bidding updates more cumbersome.

### Dune Tracker

The current [live app](https://dune-tracker.com/) identifies itself as a Dune 2019 GF9 tracker and is optimized for phone input. Its current [published application bundle](https://dune-tracker.com/assets/index-BPnTdHBh.js) exposes the state schema: selected factions, assignments keyed by card ID, unknown counts per faction, a timestamp, and compact LZ-string encoding. It automatically starts most factions with one unknown card and Harkonnen with two; assigning a known card to Harkonnen adds another unknown. It stores up to ten games locally. A separate reveal payload can share selected card IDs, which supports the social act of selling information without exposing the whole private tracker.

The type-keyed assignment model is compact but loses copy identity. That is a verified structural fact; the consequence—failure to represent two copies of one card type in the same hand—is an inference from that schema and should be confirmed in a prototype session.

### Atreides Mentat

The app is open source at [ohgoditspotato/atreides_mentat](https://github.com/ohgoditspotato/atreides_mentat). The pinned snapshot reviewed here is commit [`d87b2d6`](https://github.com/ohgoditspotato/atreides_mentat/tree/d87b2d64346c6976d04ca63b6bed5276365beedc). Its [README](https://github.com/ohgoditspotato/atreides_mentat/blob/d87b2d64346c6976d04ca63b6bed5276365beedc/README.md) confirms TypeScript/React/Redux, PWA use, and base purpose. [`initial_deck.ts`](https://github.com/ohgoditspotato/atreides_mentat/blob/d87b2d64346c6976d04ca63b6bed5276365beedc/src/ts/state/initial_deck.ts) and [`expansion_deck.ts`](https://github.com/ohgoditspotato/atreides_mentat/blob/d87b2d64346c6976d04ca63b6bed5276365beedc/src/ts/state/expansion_deck.ts) define 33 base and 14 Ixians & Tleilaxu card instances. The [reducer](https://github.com/ohgoditspotato/atreides_mentat/blob/d87b2d64346c6976d04ca63b6bed5276365beedc/src/ts/state/reducers.ts) creates initial unknowns, moves known cards between deck/hand/discard, records the draw-deck index on unknown cards, advances across reshuffles, and retains 50 undo snapshots. The [setup UI](https://github.com/ohgoditspotato/atreides_mentat/blob/d87b2d64346c6976d04ca63b6bed5276365beedc/src/ts/components/NewGame.tsx) explicitly documents the unhandled Harkonnen swap.

### Dune Companion

The [live single-page source](https://dune.how/) is also its documentation. It defines twelve faction profiles, a 33-card category/count base deck, expansion and Richese pools, Landsraad substitutions, player-held cards, discard counts, traitors, spice, notes, rules toggles, and battle-wheel state. All are stored in one `duneTrackerData` local-storage object. Its QR payload contains faction codes plus four rule toggles only. The [web-app manifest](https://dune.how/manifest.json) declares a standalone app and phone screenshots; offline availability was not verified.

### Tabletop Simulator and paper

The [Steam Workshop object](https://steamcommunity.com/sharedfiles/filedetails/?id=1971922932) is important because it shows the benefit of integrating a tracker into the play surface and using player-only visibility. The [BoardGameGeek file](https://boardgamegeek.com/filepage/246052/atreides-treachery-cards-tracker-both-expansions) shows the enduring value of an instantly understandable ownership/discard matrix and edition-aware copy counts. Neither provides a reusable rules-aware data model.

## What Dune Zone has today

Verified locally:

- Dune Zone has a strict render schema for a Treachery card in [`src/game/data/objects.ts`](../../src/game/data/objects.ts), and 69 Storybook exports across [`src/game/assets/treachery`](../../src/game/assets/treachery). Those stories cover official-looking, expansion, Richese, experimental, and meme/homebrew cards.
- The Atreides faction-sheet story already encodes bidding prescience and note-taking in [`src/game/assets/faction/sheet/Sheet.stories.ts`](../../src/game/assets/faction/sheet/Sheet.stories.ts).
- The card stories are not currently a normalized game registry: no production `deckComposition`, card-instance catalogue, or ruleset-to-deck mapping was found outside Storybook. Sixteen Treachery stories still contain `Text goes here`, so the rendering library cannot yet be treated as a complete authoritative gameplay catalogue.

Therefore “Dune Zone knows all factions and cards” is directionally promising but not yet an implementation fact. The future tracker map should first decide what counts as an authoritative ruleset/card-pool source and how official, expansion, variant, and homebrew card identities relate.

## Research-backed opportunities for Dune Zone

The following are recommendations, not verified current behavior.

1. **Make ruleset selection the source of truth.** A selected ruleset should produce the exact factions, decks, copy counts, hand limits, special unknown draws, and reshuffle/removal rules. Existing tools mostly hard-code one global catalogue plus expansion toggles.
2. **Model physical card instances, not only card names.** Use stable card-definition IDs plus instance IDs. This handles duplicate Shields/Snoopers, multiple copies in one hand, transfers, and deductions without ambiguity.
3. **Keep an append-only event history.** Events such as `observed_for_bid`, `won_by`, `unknown_drawn`, `transferred`, `played`, `discarded`, `removed`, and `reshuffled` can derive every view and make undo reliable. Thufir demonstrates the fast bidding flow; Atreides Mentat demonstrates why deck epochs matter.
4. **Represent knowledge, certainty, and provenance separately from world state.** The user sometimes knows an exact identity, sometimes only “one unknown from deck epoch 2,” and sometimes makes a guess. Preserve known, inferred, and manually suspected states instead of converting all notes into false certainty.
5. **Automate faction-specific exceptions from the selected ruleset.** Harkonnen bonus draws and swaps, Ixian interference/unknowns, Richese cache cards, Family Atomics removal, reshuffles, and later expansion rules should be explicit transitions with manual escape hatches.
6. **Optimize for the bidding moment.** Default to two taps: card, then winner. Keep deck analysis, hand inspection, notes, and correction secondary. Do not make the user navigate the whole catalogue for every auction.
7. **Support private persistence first, deliberate sharing second.** Local/offline use is table-safe. Account sync or a short handoff code could restore a game on another device. A separate “sell this information” reveal link/QR should share only selected facts, following Dune Tracker's useful distinction.
8. **Offer three derived views from one state:** a fast bidding queue, player hands/unknowns, and deck/discard possibilities. A printable ownership matrix can be an export rather than a separate implementation.
9. **Audit data rights and attribution before shipping card text/art.** Existing tools' publication is not evidence that Dune Zone has permission to redistribute publisher assets. The map should decide whether the tracker shows names/types only, uses Dune Zone-created representations, or obtains another basis for full card art/text.
10. **Measure “best” at the table.** Prototype against realistic sequences and time each update. Correctness without speed will hold up the game; speed without copy-aware state will lie to the player.

## Unknowns to resolve in the future Wayfinder map

- Which editions and rulesets are in the first release: Avalon Hill, GF9 base, each GF9 expansion, tournament variants, Dune Zone rulesets, and/or homebrew decks?
- Is the tracker strictly private to one device, restorable under a Dune Zone account, transferable by code, or live-synced?
- Does “sharing” mean selling selected information, handing the tracker to another Atreides player, exporting a game record, or all three?
- Which deductions should be automatic, which should be suggested, and which must stay manual because rules variants can invalidate them?
- How should card exchange, theft, retrieval from discard, shared cards, and anonymous/unknown cards be represented without claiming more knowledge than Atreides has?
- Is Tabletop Simulator integration an import/export target, a live companion protocol, or a separate implementation?
- What publisher text/art may be displayed, and what attribution/disclaimer is required?

## Suggested first frontier for the future map

The research makes four decisions sharp enough to ticket once that map is charted:

1. Define the supported edition/ruleset and authoritative card-pool model.
2. Prototype the fastest bidding-to-owner interaction on a phone.
3. Decide the knowledge/event model, including unknowns, deck epochs, duplicate copies, exchanges, discards, removals, and reshuffles.
4. Decide private persistence, device handoff, and selective information sharing.

Later UI, TTS, export, and automation decisions depend on those four.
