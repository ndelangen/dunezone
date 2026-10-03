# Real creations and Play visuals for the homepage

Research for [Find real creations and Play visuals for the homepage](https://github.com/ndelangen/dunezone/issues/1815), under [A Play-first homepage that invites people to create together](https://github.com/ndelangen/dunezone/issues/1814).

Checked on 3 October 2026. Source baseline is `cebfab6019c9d81fce0ea7ff6b0acb2a41d19a2e`, fetched by `bun run worktree:setup` before research edits. This report records candidates and constraints. It does not choose the final editorial selection.

## What is available

There are real saved factions, cards, decks and tokens with visible creator attribution and published artwork. The strongest contrasts in this bounded sample are the community-member names in Discord Legends, Space Orks' dice-based rules, No Field's turquoise cardback, and Water Extraction's gear-shaped token.

The Rulebook evidence is thinner. The Rulesets catalogue listed Dreamrules and Test. Dreamrules had no Rulebooks. Test contained one published Rulebook, but Test explicitly identifies itself as a functionality-testing Ruleset, unsuitable for reference or play. Its Rulebook has unfinished content. A polished, playable community Rulebook was not verified. Sources: [Rulesets](https://dune.zone/rulesets), [Dreamrules](https://dune.zone/rulesets/dreamrules), [Test](https://dune.zone/rulesets/test).

The existing public Storybook can supply real Play interface captures without entering the private beta. The Journey stories replay a recorded game through the real UI. They are development demonstrations, not evidence of an ordinary community match.

## Shortlist inspected visually

Each destination below loaded in the browser. I inspected screenshots, visible page text and attribution. "Maintained by" is the site's wording; it is not a claim that the maintainer drew every underlying illustration. Names and publication state can change after this check.

| Saved creation | What the browser showed | Attribution shown | Available preview and useful role | Limits |
| --- | --- | --- | --- | --- |
| [Dreamrules](https://dune.zone/rulesets/dreamrules) | A worm against a rainbow, moons and desert; 11 associated factions. | [Central](https://dune.zone/profiles/central), maintaining Group [dreamers](https://dune.zone/groups/dreamers). | Loaded cover and faction tiles. Connects Rulesets to collaborative maintenance. | Empty About and no Rulebooks. Do not offer a "Read the Rulebook" action for it yet. The Group page itself was not inspected. |
| [Discord Legends](https://dune.zone/factions/discord-legends) | Black-and-cream leader discs named Jaded, Central, Ridwan, Cookie Masher, Krell and Eichmal. Jayne is the faction leader. Its rules let the player change which faction advantages they use. | [Eichmal](https://dune.zone/profiles/eichmal); no maintaining Group. | Rendered leader discs, faction-sheet preview and published PDF; page reports current public assets. Good evidence of making something personal to a playing community. | A saved homebrew faction, with no Ruleset assigned. Its names do not establish that those people approved an endorsement. |
| [Space Orks](https://dune.zone/factions/space-orks) | Green discs with crossed axes, five named leaders and Ghazghkull Thraka as faction leader. Rules include dice-based combat and persistent leader-strength increases. | [BigDave](https://dune.zone/profiles/bigdave); no maintaining Group. | Rendered tokens, faction-sheet preview and published PDF; page reports current public assets. Shows how far a homebrew faction can depart from the familiar set. | Portraits are the artwork actually saved, including blue-skinned figures and a familiar Dune portrait. Do not promise franchise-specific artwork. A troop warning says battle strengths are unset, so this is not proof of Play readiness. |
| [No Field](https://dune.zone/assets/deck/no-field) | A turquoise-and-gold geometric cardback. The composition shows one Arrakeen card and five Snooper copies. | [IHasPinecone](https://dune.zone/profiles/ihaspinecone); no maintaining Group. | Loaded cardback, member-card previews and an Open published image link. Shows that a deck combines an authored back with reusable cards and quantities. | About is empty. The name alone does not establish a complete Ixian rules package. |
| [Water Extraction](https://dune.zone/assets/token-tech/water-extraction) | A brown gear-shaped token with a white droplet and curved name. About describes its Iduali use. | [Amon_Tellur](https://dune.zone/profiles/amon-tellur); no maintaining Group. | Loaded front, plus published front/back links. Gives the selection a different silhouette and shows rules carried by a small component. | Not in a bundle. The back link was observed, but its artwork was not separately assessed. |
| [Ginaz Alliance ability](https://dune.zone/assets/token-enhance/ginaz-alliance-ability) | A wide turquoise token with a white glyph, with Front and Back presentations. | [Amon_Tellur](https://dune.zone/profiles/amon-tellur); no maintaining Group. | Both JPEGs loaded at 600 by 372 pixels. Useful as a simpler rectangular counterpoint to cards and discs. | No About text or bundle. It is visually spare, so it is a supporting example rather than evidence of a complex finished design. |

Two additional saved examples explain the editorial limits:

- [Cryo-Sleepers](https://dune.zone/factions/cryo-sleepers), maintained by [Argelius](https://dune.zone/profiles/argelius), has icy turquoise discs and snowflake symbols. Its Cryo-card rules revive forces through the Spice deck. The page reports current public assets, but several leaders are still named "new leader" and its Alliance and Fate text is placeholder text. This is an interesting work in progress, not a polished rules recommendation.
- [Arrakeen](https://dune.zone/assets/card-treachery/arrakeen), maintained by IHasPinecone, is a green-topped special card with a geometric emblem and printed rules. Its published front is visible in No Field. Its About text is a Lorem Ipsum joke, so the page needs editorial context if selected.

These are production-saved records observed on the site, not Storybook fixtures. This investigation did not establish who authored the original illustrations or test the balance or completeness of the rules.

## Direct published preview references

These image paths came from the detail pages' publication links. They are useful input references, not a recommendation to hardcode their current revision parameters into a homepage. The page data already supplies preview URLs.

| Creation | Published image |
| --- | --- |
| No Field | [Cardback](https://dune.zone/published/decks/ns7bpqj41ms5gnwras8223v8zx8cyeyr/cardback.jpg) |
| Arrakeen | [Card front](https://dune.zone/published/cards/ns74r72v6mdmnn8ahdmj27c8gs8cz5t6/card.jpg) |
| Water Extraction | [Front](https://dune.zone/published/gear-tokens/ns70854wjkwwfthp879v2cbvxh8d189d/token.jpg), [back](https://dune.zone/published/gear-tokens/ns70854wjkwwfthp879v2cbvxh8d189d.back/token.jpg) |
| Ginaz Alliance ability | [Front](https://dune.zone/published/rectangle-tokens/ns78gn4z36vfzd41azvawdvewd8cy724/token.jpg), [back](https://dune.zone/published/rectangle-tokens/ns78gn4z36vfzd41azvawdvewd8cy724.back/token.jpg) |

The faction detail pages offer public sheet previews and PDFs. For a small homepage composition, faction tokens and leaders are better-sized candidates than a full PDF screenshot. The publication contract supports faction-token and leader JPEGs, but this research did not independently load a full set of their publication URLs for the shortlisted factions. [Publication contract](https://github.com/ndelangen/dunezone/blob/cebfab6019c9d81fce0ea7ff6b0acb2a41d19a2e/src/shared/asset-publishing/publicationTargets.ts).

## The Rulebook gap

[My First Rulebook](https://dune.zone/rulesets/test/rulebooks/my-first-rulebook) is a real saved and published artifact, not an invented sample. The browser showed Edition 2, published 13 September 2026, with five Pages and working reader content. It offers Edition HTML and PDF links. Attribution comes from its parent Test Ruleset, maintained by Central and testgroup; the reader did not show a separate author credit.

I inspected its dark-blue starfield cover and [Ixians and Tleilaxu synopsis page](https://dune.zone/rulesets/test/rulebooks/my-first-rulebook#page-zfra). The synopsis has a strong two-column print layout and a navy title band. It also visibly contains "No faction selected". Later navigation entries include "New page". The cover footer has informal test copy.

This can demonstrate the authoring tool if labelled as a test Rulebook. It should not become evidence of a completed community rules release. A decision is still needed about whether the homepage uses that honest demonstration, waits for a suitable authored Rulebook, or explains reading and authoring through another treatment. This research did not edit the saved Rulebook or manufacture a replacement.

The existing Rulebook list contract returns `first_page_image_url`, capture status, Edition publication time and separate HTML/PDF readiness. First-page publication preserves a usable image while replacement work is pending. It supplies a cover, not arbitrary interior-spread screenshots. An interior crop needs a deliberate capture of the published Edition. Sources: [Rulebook list](https://github.com/ndelangen/dunezone/blob/cebfab6019c9d81fce0ea7ff6b0acb2a41d19a2e/convex/lib/rulebookList.ts), [first-page publication](https://github.com/ndelangen/dunezone/blob/cebfab6019c9d81fce0ea7ff6b0acb2a41d19a2e/convex/lib/rulebookPublication.ts).

## Play captures without exposing the beta

The [public Storybook](https://storybook.dune.zone/) has Pages / Play / Journey, with chapters for drafting, trading, traitors, starting troops, Spice Blow, battle reveal and the finish. I opened [Spice Blow](https://storybook.dune.zone/?path=/story/pages-play-journey--spice-blow), expanded the preview and hid its large journey panel. It rendered the golden Arrakis board in perspective, troops, cards, faction markers, phase controls, a private hand and the player panel. No beta page or live game was opened.

The Journey source describes a six-seat game recorded from the game Worker, replayed step by step. This is a stronger capture source than a hand-built promotional mockup. The chapter inspected was J36, "Spice placed", within a 61-step recording. It uses real product rendering with a recorded development scenario. Source: [Journey stories](https://github.com/ndelangen/dunezone/blob/cebfab6019c9d81fce0ea7ff6b0acb2a41d19a2e/src/app/routes/_app/play/journey.stories.tsx).

Keep that distinct from the other product stories. Their README records six public faction definitions copied on 21 September 2026, public profiles and published artwork. Their scenario conversations and event sequences are staged. Their scripted transport supplies replies and does not execute game rules. Source: [Play fixture provenance](https://github.com/ndelangen/dunezone/blob/cebfab6019c9d81fce0ea7ff6b0acb2a41d19a2e/src/app/routes/_app/play/product.stories.fixture/README.md).

For the prototype, capture the current Journey table at a useful desktop size. Crop out the Storybook frame, journey controls and any path text. Label it as a development preview of Dune Play, coming soon. Publish only the selected image or recording through promotional content; a homepage preview should not navigate to the beta or expose a live game's identity. The browser's screenshot proved the candidate scene exists, but a final promotional still or film was not produced in this research.

Existing permanent visual comparisons in [Play: sharper, truer card and token art, plus a Table lighting slider](https://github.com/ndelangen/dunezone/pull/1761) can inform the art direction. They are review material, not a selected campaign asset. Their screenshot files were not visually assessed in this bounded pass. No finished promotional video was verified.

## Existing homepage and catalogue contracts

The live [homepage](https://dune.zone/) leads with "Make Dune your own", links to Rulesets and faction creation, and links its current online-play action to an external site. Its animated leader is illustrative. The source uses three hardcoded portrait/edit states and explicitly calls them the page's illustration rather than anyone's data. Those states must not be relabelled as community creations. Source: [homepage route](https://github.com/ndelangen/dunezone/blob/cebfab6019c9d81fce0ea7ff6b0acb2a41d19a2e/src/app/routes/_app/index.tsx).

The homepage query returns two faction spotlights, community counts and four newest discoverable profiles. It does not currently return an editorial selection, Ruleset previews, Rulebook spreads or recent Assets. It already composes reusable domain reads, which is a useful place to keep a single page subscription. Sources: [homepage query](https://github.com/ndelangen/dunezone/blob/cebfab6019c9d81fce0ea7ff6b0acb2a41d19a2e/convex/homepage.ts), [app data doorway](https://github.com/ndelangen/dunezone/blob/cebfab6019c9d81fce0ea7ff6b0acb2a41d19a2e/src/app/db/homepage.ts).

Faction selection reads up to 500 non-deleted factions. New arrival is the latest valid creation timestamp. Freshly updated is the latest update later than creation, excluding that new arrival. Equal dates break by identity. Homepage previews contain only slug, timestamps, name, logo and background; they omit leaders and attribution. On the checked live page the selected records were Discord Legends and Test Faction. There is no editorial-quality exclusion in this selector. Source: [faction catalogue](https://github.com/ndelangen/dunezone/blob/cebfab6019c9d81fce0ea7ff6b0acb2a41d19a2e/convex/lib/factionCatalogue.ts).

Asset landing data reads the newest five non-deleted records of each type, then sorts by creation time. Keeping a per-type sample prevents a busy card category from hiding tokens. Entries carry names, slugs, type, timestamps, public owner summary, `previewHref` and an authored back URL where relevant. Deck presentation resolves a preset or referenced back, including the referenced image's revision; a missing reference has a defined fallback. Reuse that behavior instead of reconstructing it in homepage components. Source: [Asset queries](https://github.com/ndelangen/dunezone/blob/cebfab6019c9d81fce0ea7ff6b0acb2a41d19a2e/convex/assets.ts).

Published image URLs use stable identities and revision hints, not mutable slugs. JPEGs already exist for cards, deck backs, faction components and token shapes. The social-image endpoint creates share-card graphics and can fall back to a monogram; a social card existing therefore does not prove the underlying artwork is ready. Sources: [publication targets](https://github.com/ndelangen/dunezone/blob/cebfab6019c9d81fce0ea7ff6b0acb2a41d19a2e/src/shared/asset-publishing/publicationTargets.ts), [social images](https://github.com/ndelangen/dunezone/blob/cebfab6019c9d81fce0ea7ff6b0acb2a41d19a2e/docs/technical/social-images.md).

## Decisions the evidence leaves open

- Which exact creations deserve the hand-picked positions, and what attribution accompanies them?
- What makes an item eligible for the smaller recent section? The existing date selector can feature Test Faction or an unfinished creation. A test-name blacklist would be a new policy, not an existing contract.
- What should the Ruleset/Rulebook invitation show until there is a suitable finished reading example?
- Which Play chapter, camera angle and crop best communicate the coming release? A still is already feasible; a finished film remains work to specify.

The browser used an existing signed-in session. Public navigation, rendered content and public publication links were inspected without editing records. Some first paints showed anonymous navigation before the signed-in controls appeared. Independent anonymous retrieval through the web tool failed, and direct anonymous HTTP requests returned 403, so this pass does not certify every destination's anonymous behavior. Delivery should verify the selected examples in an anonymous browser.

This was a bounded visual sample, not a full collection audit. It did not assess mobile crops, image budgets, rights provenance, gameplay balance, beta capacity, or final promotional wording. No production data, application code, parent-map decisions or beta access settings changed.
