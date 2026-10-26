# Six base faction differences, source comparison

Researched 26 October 2026. This is preparation for the differences book, not a proposed rewrite of the as-is book. All page numbers below are PDF pages counted from the cover. The 2019 book's printed pages agree with its PDF positions for the cited pages. New source pages 4, 5 and 27-33 and old source pages 2, 3 and 16-19 were rendered and visually inspected, in addition to reading the text. New source page 24 supplies the narrowed cancellation table and page 26 supplies Spirit World.

## Sources and frozen digital baselines

- `O19`: Official GF9 2019 Rulebook, [mirror](https://raw.githubusercontent.com/ronaldossendrijver/treachery.online/master/Client/wwwroot/docs/Dune-Rulebook.pdf). Download verified SHA-256 `6c55d28e93b6948a34d20b0f50e1087494e06f237f8c43e7e4c0cac3810b752d`.
- `FAQ20`: Official November 2020 Q&A, [supplied attachment](https://github.com/user-attachments/files/33447700/Dune-FAQ-Nov-2020.pdf). Downloaded and read the relevant faction answers directly, not only the historical judgement summaries. Verified SHA-256 `b6dc77d7778fb0fee800e3995e6fbf620531f7a6b1fd32af2303266f60bf2039`.
- `N26`: User-supplied clearer second-edition scan, repository `content/gf9-2-0/source-clearer.pdf`. Original images are authoritative. `transcript-reworked.md` remains an earlier reading aid with historical uncertain words, including a wrongly guessed Guild leader name. Do not copy those guesses into a new comparison.
- `DZ1`: Live GF9 `dune-core-rules`, Edition 2, created `2026-10-21T18:05:00.515Z`, 50 pages. [Pinned reader](https://dune.zone/rulesets/gf9/rulebooks/dune-core-rules?edition=2).
- `DZ2`: Live GF9 2.0 `gf9-2-0-rulebook`, Edition 3, created `2026-10-25T21:55:33.773Z`, 61 pages. [Pinned reader](https://dune.zone/rulesets/gf9-2-0/rulebooks/gf9-2-0-rulebook?edition=3).
- Historical Dune Zone choices are in `content/gf9/core-judgements.json`. They explain how the old digital book differs from bare 2019 printing. They do not establish official rules by themselves.

A citation such as `DZ2 50/QJWF/PDGZ` means digital page 50, stable Page ID QJWF, Block ID PDGZ. The old digital book has rule explanations beyond the 2019 printing, so use both before columns.

## Source roster check

These changes are confirmed from the printed token illustrations, which native PDF text extraction misses. New roster names are also present through the correct production faction references in DZ2 pages 5-6. The detail pages use older faction references for emblem and troop illustrations, not the old leader roster.

| ID | Faction | 2019 illustration | 2.0 illustration | Effect and source |
| --- | --- | --- | --- | --- |
| F01 | Atreides | Duncan Idaho 2 | Duncan Idaho 3 | One extra leader strength in battle, and the corresponding printed kill/revival values follow that strength. Other Atreides leader values remain 5,5,4,1. O19 p2; N26 p4; DZ2 p5 `874R/MWET`, faction `k178pt05y4abwvwxeg247snr758gv794`. Confirmed mechanics. |
| F02 | Atreides ruler | Paul Muad'Dib | Duke Leto Atreides | Ruler identity/artwork and description change, not a separate battle leader being added. O19 p2; N26 p4. Confirmed component/theme change. |
| F03 | Bene Gesserit | Alia 5, Margot Lady Fenring 5, Mother Ramallo 5, Princess Irulan 5, Wanna Yueh 5 | Lady Anirul Corrino 5 replaces Alia; other four remain 5 | Name and portrait change, no numerical balance change. O19 p2; N26 p4; DZ2 p5 `874R/Z3YN`, faction `k1755fjba9y9b2hkfph4ztdy3s8gvwm8`. |
| F04 | Emperor | Hasimir Fenring 6, Captain Aramsham 5, Caid 3, Burseg 3, Bashar 2 | Hasimir Fenring 6, Captain Aramsham 5, Bashar Garon 3, Colonel Kolona 3, Wensicia Corrino 2 | Lower three names/portraits change; strength distribution remains 6,5,3,3,2. Do not say Bashar was buffed from 2 to 3 without explaining the replaced roster identities. O19 p3; N26 p4; DZ2 p5 `874R/7RJG`. |
| F05 | Spacing Guild | Staban Tuek 5, Master Bewt 3, Esmar Tuek 3, Soo-Soo Sook 2, Guild Rep 1 | Starguide Serello 5, Ertun 4, Olar 3, Crozeed 2, Loyxo 1 | Entire roster renamed/reillustrated; one 3 becomes a 4, raising total strength from 14 to 15. The new first name reads Starguide Serello in the clearer scan, matching live production. O19 p3; N26 p5; DZ2 p6 `LKXC/SNAK`, faction `k1716zfezm7w1ppfzp8gwzk63d8gvmhy`. |
| F06 | Fremen and Harkonnen | Fremen 7,6,5,3,2; Harkonnen 6,4,3,2,1 | Same strength sets and same five characters each | No numerical roster change found. Shadout spelling and abbreviated titles are not mechanics. O19 p3; N26 pp4-5. Checked nonchange. |

## Atreides

### F07. Spice Vision has a wider inspection window

O19 p17 says inspect at the start of Movement, before anyone moves. DZ1 p33 `JT75/MLZF` repeats start of Shipment and Movement. N26 p31 permits looking at the top Spice card any time during Shipping and Movement. DZ2 p50 `QJWF/PDGZ` matches. Confirmed difference in the printed timing window, not a licence to inspect during any phase. The [publisher announcement](https://gamefound.com/en/projects/gf9/dune/updates/5) describes the effect as unchanged, so separate the familiar information gained from this broader written window. A teaching example can show Atreides waiting until later in the phase before checking the current top card.

### F08. Prescience asks for combined force plus spice strength

O19 p17 asks leader, weapon, defense or number dialed. N26 p31 instead names leader disc or Cheap Hero, Weapon slot, Defense slot, or force strength dialed plus spice strength. DZ2 p50 `QJWF/43Q3`. This follows the new combat system and matters because a dial alone no longer expresses the complete force-related total. New text also generalizes the exhausted question to no leader, an empty slot or zero strength. O19 only illustrated absent weapon/defense. DZ1 p33 `JT75/MLZF` has the earlier dial formulation. Confirmed adaptation plus clarification. Do not describe the ability as inspecting the entire plan or independently inspecting both numbers without asking for that element.

### F09. Kwisatz Haderach losses are tracked publicly

O19 p17 says secretly keep track; N26 p31 says publicly keep track and explicitly includes losses to a Traitor call. Threshold remains seven battle losses and activation is immediate. DZ1 p34 `RLL7/9VH7` still says secretly; DZ2 p50 `QJWF/9XLS` says publicly. Confirmed information change; traitor-loss inclusion is explicit clarification unless an older ruling is cited. Storm and worm deaths are not added by this text.

### F10. A dead Kwisatz Haderach may revive before normal leader revival unlocks

O19 p17 says revive like any other leader. DZ1 p34 `RLL7/3EH7` requires normal leader eligibility, per historical judgement `GF9-CORE-011`. N26 p31 explicitly permits the player's one normal leader revival to be spent on the token for 2 spice even before leader revival is triggered. DZ2 p51 `44R2/Q7RW`, item 2. Confirmed reversal for readers of our old book. It consumes the one leader revival, rather than being an extra free revival. Its death still does not gate revival of the five ordinary Atreides leaders. That latter point is unchanged.

### F11. Allied Prescience explicitly informs both Atreides and ally

O19 p17 says force the opponent to show the ally one element; N26 p31 says reveal to you and your ally. DZ1 p33 `JT75/MLZF`, last item, names only the ally. DZ2 p51 `44R2/YWJ7` names both. Confirmed wording/access clarification. Avoid selling this as a major power increase because legal information sharing already exists.

### F12. Golden Path remains whole-plan inspection

O19 p14 already allowed inspection of any one player's entire Battle Plan, not merely the Atreides opponent. N26 p31 retains it and explicitly says it cannot be cancelled by Karama. DZ1 p34 `RLL7/V6XP` and p46 `7UL4/WA7L` already allow any player; DZ1 p44 `TTSY/6Y47` already excludes cancelling another faction's special Karama. DZ2 p51 `44R2/9NLM`. Checked nonchange in the power itself. The new Spirit World trigger is covered by F46.

## Bene Gesserit

### F13. Use the Advanced setup and advisors as the normal game

O19 p18 Basic starts one force in Polar Sink; its Advanced setup already allowed one anywhere after Fremen placement, fighter if alone. N26 p27 adopts that Advanced setup in the unified game. DZ1 p35 `MH2Y/9EUL` versus p36 `FDA3/9DFP`; DZ2 p42 `W68K/AA32`. This is a change for Basic players, not an invention relative to 2019 Advanced. Five spice, nineteen reserves and one free revival remain unchanged.

### F14. Voice no longer controls Worthless cards or Cheap Heroes

O19 p18 expressly permits Voice about a Worthless card or Cheap Hero, and FAQ20 p9 identifies Cheap Hero control as a 2019 change from earlier editions. N26 p27 limits Voice to weapon/defense types in those slots, expressly excluding Cheap Hero, Worthless cards and Reinforcements. DZ1 p35 `MH2Y/BSAS` permits the old range; DZ2 p42 `W68K/ND4M` excludes it. Confirmed important nerf. A useful lesson is that forbidding a weapon cannot force the opponent to use or avoid their Cheap Hero.

### F15. Voice uses printed general types, including Special

FAQ20 pp4-5 required naming exact special cards and expressly disallowed a generic special-card instruction. N26 p27 permits kinetic, poison or special as weapon/defense types, and applies a prohibition to a multiply labelled card when any relevant label matches. N26 p28 distinguishes a card's labels from incidental effects and says Gas Tooth requires a special-weapon prohibition. DZ2 p44 `27N9/WAFR` and `UPNR`; old DZ1 p35 `MH2Y/BSAS`. Confirmed change in the command vocabulary. Keep the optional alternate role exception: Weirding Way cannot be forced into its defense role and Chemistry cannot be forced into its weapon role merely because that role is possible. The older FAQ already had that exception, so it is not new. Standard rule order Voice before Prescience also was already O19 p23.

### F16. Transmutation follows the Karama/Solaris split and gains battle-spice payment

O19 p18 Advanced allows Worthless as a Karama; that included old Karama purchasing and shipment effects. N26 p27 explicitly permits Worthless as narrowed Karama or as Solaris. The new battle-spice payment from the Bank is an extra option. DZ1 p36 `FDA3/42J4`; DZ2 p42 `W68K/2AB8` and `8L3M`. Confirmed mechanics adaptation. Cancellation remains limited to the target's listed vulnerable advantage; this is not a way to retain old broad Karama cancellation.

### F17. Advisors no longer automatically become fighters when alone

O19 p18 and FAQ20 p4 automatically flip lone advisors and permit a moving advisor to become a fighter on entering an occupied territory. N26 p28 permits advisor-to-fighter flips any time before Shipping and Movement begins and says advisors may not otherwise flip to fighters. DZ1 p36 `FDA3/94PD` items0,1,3 versus DZ2 p44 `27N9/4WV4`. Confirmed substantial restriction. An advisor left alone later in the round stays an advisor and does not suddenly collect spice or control the stronghold. The setup-alone rule is its explicit separate exception.

### F18. The pre-shipment flip window starts earlier

O19 p18 allowed the declared flip after Spice Blow and Nexus and before shipment. N26 p28 says any time before Shipping and Movement begins. DZ1 p36 `FDA3/94PD` item1; DZ2 p44 `27N9/4WV4`. Confirmed timing broadening relative to printed 2019, though the book does not separately detail every priority dispute in earlier phases. Do not infer a right to flip after the phase has begun.

### F19. Do not flip a moving group simply to merge into your opposite face

FAQ20 p4 permits forces joining their other face to end as that existing type. DZ1 p36 `FDA3/94PD` item4 repeats it. N26 p27 Dual Forces explicitly prohibits flipping fighters/advisors to join existing tokens of the other type. The accompanying-advisor deployment exception remains. DZ2 p43 `4WXN/VHXT`. Confirmed restriction. If fighters already occupy a destination, accompanying someone else's shipment can still flip them into advisors before the free advisor is deployed, per DZ2 `4WXN/H657`.

### F20. Normal shipping brings only fighters; moving fighters can become advisors

N26 p28 allows normal paid shipment only as fighters, into your fighters or into a territory with no tokens of yours. Moving fighters into another faction's occupied territory where you had no forces may instead flip to advisors; they must do so if that faction is your ally. DZ2 p44 `27N9/6HFP`. O19 p18 normal shipping rule described unoccupied territories and FAQ20 p4 allowed shipping into your advisors. DZ1 p36 `FDA3/94PD` items3-4 still uses the older model. Confirmed part of the rebuilt face-transition rules. The older unoccupied-territory sentence should not be generalized into a blanket old ban on shipping among enemy forces. Do not import the old ability for moving advisors to become fighters mid-phase.

### F21. Intrusion explicitly includes deployments

O19 p18 allows flipping fighters to advisors when another faction ships or moves in. N26 p28 adds deploys and retains immediate optional flipping. DZ1 p36 `FDA3/94PD` item2 already includes worm riding but does not generally name deploys; DZ2 p44 `27N9/84R9`. Confirmed wording/trigger broadening. For accompanying shipment, the special merge exception is specifically spelled out on p27.

### F22. Advisors and allies have an intended coexistence exemption, but cross-reference the general constraint

FAQ20 p4 explicitly says an ally sharing with advisors must obey evacuation; DZ1 p36 `FDA3/VMED` and `3R77` retain it, under judgement `GF9-CORE-005`. N26 p28 now says advisors have no effect on other factions even with an ally and requires moving fighters joining an ally to become advisors. DZ2 p44 `27N9/78QQ` and `6HFP`. This strongly supports a changed ability to coexist with the ally as advisors. However, N26 p21's general alliance constraint does not state its advisor exception. Record this as a source cross-reference tension, not a gap to silently repair. The teaching book should explain the specific p28 exception and link it, or obtain a designer confirmation if exact formal treatment is required.

### F23. Charity's modifiers are explicit; the two-spice income is old Advanced play

O19 p18 already grants Advanced BG two spice regardless of current holdings. N26 p27 adds that effects modifying CHOAM Charity modify this amount. DZ2 p42 `W68K/JQPB`; DZ1 p36 `FDA3/42J4`. Carry forward as explicit interaction wording, not a new unconditional flat-income rule relative to Advanced. Full CHOAM compatibility must be separately checked against that expansion's rules; the six-faction 2.0 book does not replace its sheet.

### F24. Prediction's exclusion is generalized by ability title

O19 p18 excludes the Guild and Fremen special victories by name. N26 p27 excludes any win via an advantage titled Special Victory Condition. DZ1 p35 `MH2Y/N8L3`; DZ2 p42 `W68K/S4SK`. Confirmed generalization, useful with expansion factions. Prediction can still target the eventual ally's normal win. Merely losing one's special end-game win is not proof that a predicted fallback win is legal; tie into the new victory hierarchy rather than guessing.

## Fremen

### F25. Starting spice rises from three to four

O19 p16 and DZ1 p38 `YEX5/WKXL` give three. N26 p28 and DZ2 p45 `46PP/GLAM` give four. Confirmed setup change. Starting forces, legal initial three-territory distribution, free deployment range, two-territory normal movement and three free force revivals are otherwise retained.

### F26. Storm Insight inspects the next top card instead of selecting/shuffling a card

O19 p16 Advanced has the Fremen randomly select the next Storm card, inspect it, then return/shuffle/select each round. N26 p28 allows inspection of the top Storm card at the end of Storm. DZ1 p39 `WYUA/MD69`; DZ2 p45 `46PP/8C9Y`. Confirmed procedural change linked to the general new Storm deck process. Its power is future knowledge, not permission to choose a desired storm distance. Whether the deck exists without Fremen is a general Storm change handled elsewhere.

### F27. Movement and worm riding may enter storm at half loss

O19 p16 only explicitly permits reserve placement into storm. FAQ20 p5 expressly prohibits ordinary movement and worm rides into or out of storm, and DZ1 p39 `WYUA/M2ZL` follows that. N26 pp28-29 explicitly permits shipment, a one-territory move, and worm riding into storm at half loss. DZ2 p45 `46PP/CHFH`; p47 `4VYV/G539` and `5P8G`. Confirmed reversal. Do not teach storm transit: the FAQ-style new example forbids shipping into storm and then moving to another storm territory; worm riding jumps to a destination sector rather than tracing a path. Leaving storm is not generally authorized by the new wording, and should not be invented.

### F28. Half storm loss is a minimum, and counts tokens

N26 p28 explicitly allows choosing to lose more or all forces and calculates half rounded up by force tokens, ordinary or Fedaykin. DZ2 p45 `46PP/BTLF`. O19 p16 says only half are killed; the new optional extra losses are explicit. Count a Fedaykin as one token for storm, not two battle strength. Treat voluntary extra loss as a new explicit choice, not proof every earlier table prohibited voluntary loss through all effects.

### F29. Call Sandworms now keys off the phase's first worm and resolves placed worms after Nexus

O19 p16 Advanced says all additional worms after the first may be placed; its p13 double-discard procedure does not explicitly settle whether that faction-specific trigger resets per pile. DZ1 p39 `WYUA/M6A2` expressly applies it per pile. N26 p29 says all subsequent Shai-Hulud after the first drawn that phase may be placed at the end of the Nexus, and permits riding from your or your ally's resulting territory. DZ2 p46 `SHV2/BRZ9`. Confirmed changed sequence relative to our Dune Zone book under the new Spice draw procedure. The bare 2019 faction wording is less explicit, so do not describe phase-wide counting alone as a proven reversal of that printing. The exact general draw sequence should come from the core comparison rather than projecting the old two-pile machinery into this sentence.

### F30. Battle Edge is free spice strength, not old full-strength support

O19 p16 Advanced requires no spice to count full strength. N26 p29 gives the new spice-strength bonus automatically for the number dialed. DZ1 p39 `WYUA/5MF7`; DZ2 p46 `SHV2/CLYJ`. Confirmed adaptation to the new combat system. Under Classic Spice Dialing, N26 p26 explicitly returns this to always full strength without spice. Do not teach the Classic variant's wording as the default 2.0 effect.

### F31. Ghola can bypass the one-Fedaykin normal revival limit

O19 p16 says one per turn, and FAQ20 p2 explicitly says Ghola, Emperor alliance and Tleilaxu cannot revive more than one. N26 p29 says only one normally per round, except Ghola. DZ2 p46 `SHV2/C3TF`; DZ1 p39 `WYUA/5MF7`. Confirmed reversal with a named exception. It does not automatically grant a Tleilaxu exception or unlimited ordinary revival.

### F32. Fremen special victory now accepts the ally's occupation

O19 p16 requires Sietch Tabr and Habbanya Sietch occupied only by Fremen or nobody and excludes Atreides/Harkonnen/Emperor from Tuek's. FAQ20 p5 explicitly says allies do not count as Fremen for the test. DZ1 p38 `YEX5/BP8A` retains it. N26 p29 allows you, ally or nobody in Sietch Tabr and Cave of Birds, and exempts an allied Atreides/Harkonnen/Richese/Emperor from the Tuek's prohibition. DZ2 p47 `4VYV/BCUR`. Confirmed meaningful alliance relaxation. Cave of Birds is the renamed Habbanya Sietch location, not a newly required extra stronghold. Richese's inclusion in the prohibited list was already in its old expansion; do not label that addition alone a new 2.0 mechanic.

### F33. The alliance explicitly grants worm riding and sets total free revival to three

N26 p29 spells out protecting allies and allowing rides after Nexus, and says increase free revival to three. DZ2 p47 `4VYV/5BJK`. O19 p16 expressly granted protection and three free revivals, but not ally riding in that paragraph. DZ1 p38 `YEX5/YM8Q` already interprets the three as the total, not additional, under judgement `GF9-CORE-010`. Treat revival wording as codifying the existing Dune Zone reading. Treat added ride permission as explicit new printed alliance coverage until any older specific FAQ establishing the same permission is pinned. Do not call three free revivals a nerf from six.

### F34. Bless the Maker is a drawn-worm effect with a placement choice

O19 p14 allows a special Karama worm in any sand territory. The O19 p22 answer said no Nexus; FAQ20 p3 corrected it to a phase-end Nexus, already adopted by DZ1 p39 `WYUA/PJSC`. N26 p29 treats it as Shai-Hulud drawn during Spice Blow and Nexus and permits either the last Spice Blows card's territories or placement as Call Sandworms at end of Nexus. DZ2 p46 `SHV2/QAPT`. The new placement/procedure is a confirmed change. Merely generating a Nexus is not new against FAQ20 or our existing book. Spirit World adds Harj as the optional alternate trigger.

## Emperor

### F35. Allied gifts move to phase boundaries

FAQ20 p5 permits giving spice directly for any reason, and DZ1 p37 `C7ZR/FJ2X` explicitly says at any time, immediately usable. N26 p30 says any amount at the end of any phase, directly behind the ally's screen. DZ2 p49 `CBT5/26UE`. Confirmed timing restriction. Ordinary allied purchase/shipment contributions still occur at their normal payment time, and are not automatically transformed into gifts. The new Q&A on p30 distinguishes the Emperor-funded contribution sent to Bank from the ally's own payment received by Emperor. Keep this distinction in any example.

### F36. Extra allied revivals are replaced by a battle-spice discount

O19 p19 grants payment for three extra allied force revivals, beyond the ally's usual three. DZ1 p37 `C7ZR/VA7L` repeats the six-total base-game allowance. N26 p30 drops that benefit and instead halves the ally's cost for spice strength, e.g. +2 for two spice instead of four. DZ2 p49 `CBT5/26UE`. Confirmed major change. Do not continue teaching the six-revival ally benefit in 2.0. The discount is on spice strength in default combat, not an undefined blanket half-price battle effect under Classic Spice Dialing.

### F37. War Machine revives up to four forces AND one leader

O19 p14 grants up to three forces OR one leader. N26 p30 grants four forces including Sardaukar AND one leader during Revival, outside normal revival counts. DZ1 p37 `C7ZR/G6UP` and p46 `7UL4/WA7L`; DZ2 p48 `GP27/57YJ`. Confirmed buff. N26 also expressly allows extra Sardaukar by this power and Ghola in the Sardaukar paragraph, reversing FAQ20 p2's one-total-per-turn limit. DZ2 `GP27/AAYQ`. Setup twenty reserves, ten spice and one free revival remain unchanged. Sardaukar still double versus everyone except Fremen.

## Harkonnen

### F38. Replace some or all initially drawn own traitors once

O19 p17 requires keeping all four including own leaders. N26 p32 permits revealing and setting aside some/all own leaders, drawing that many replacements before other players' returns, keeping replacements even if own again, then shuffling set-aside cards back. DZ1 p40 `DJ8P/6KWM`; DZ2 p52 `SVS5/4QZ3`. Confirmed setup buff. It is not repeated until every traitor is an enemy, and does not grant extra kept cards.

### F39. Capture return triggers on all own leaders unavailable, not only dead

O19 p17 says return captives once all own leaders are killed. DZ1 p40 `DJ8P/7D5G` retains that. N26 p32 includes killed, captured or face-up from previous battles. DZ2 p52 `SVS5/44MJ`. Confirmed restriction/clarification. A living own leader already committed elsewhere this round counts as unavailable. Capture remains a random available enemy leader, secretly inspected before choosing two-spice kill or one-time use. Own safe-traitor calling against a captured leader is expressly illustrated in N26 p19 and p32, but the general old traitor rule already turns on an opponent playing the matching leader; call this codification unless a contrary older ruling is pinned. The new book does not explicitly retain the old FAQ's face-down second-death handling for an executed captive; do not silently import that old detail.

### F40. Vendetta replaces one-player hand theft with a table-wide exchange

O19 p14 permits any number up to one player's entire hand; FAQ20 p6 says up to four, the interpretation used by DZ1 p40 `DJ8P/YSCN` and p46 `7UL4/WA7L`, judgement `GF9-CORE-013`. N26 p32 instead acts at end of Bidding: take one random card from every other player and one from deck, then choose one from your combined hand to give to each player and discard one if you have nine cards. DZ2 p53 `ECSZ/39V6`. Confirmed complete replacement. Check edge cases with empty hands/low deck and eight-card limit during teaching design; the source does not spell all of them out. The power says its action has no effect on the hand limit. It is not the old four-card swap with extra targets appended.

## Spacing Guild

### F41. Eight starting spice and a compulsory setup shipment replace five forces fixed in Tuek's

O19 p19 starts five in Tuek's, fifteen reserves and five spice. N26 p33 starts twenty reserves and eight spice, then mandates one shipping action after setup step5, with the Bene Gesserit accompanying advisor allowed. DZ1 p41 `25R4/WE8N`; DZ2 p54 `EPLF/5LYJ` and `K5VV`. Confirmed setup change. The text does not say the shipment is free; use Guild rates and legal destinations. One legal example is five forces to a stronghold at ceiling of 5/2 =3 spice, leaving five spice, but the choice of force count and territory is now open. This setup action is additional to normal round play, not the first round's shipment being consumed in advance. Resolve any requested zero-force or card use setup edge cases explicitly instead of assuming an unstated exception.

### F42. Guild cross-shipment loses the half-price discount

O19 p19 says half normal fee when shipping its forces, and FAQ20 p5 only clarifies rounding. DZ1 p41 `25R4/6D7Y` explicitly halves the first two shipment types. N26 p33 applies half price only to/from Dune, with cross-shipping at normal rates. DZ2 p54 `EPLF/7SQQ`. Confirmed economic nerf. Four forces cross-shipping to a stronghold cost four, not two. Return-to-reserve stays half price, rounded up. Troop Carrier still offers exactly one shipment action chosen from three types, not all three each round.

### F43. Allies gain the return-to-reserve option and use the revised Guild Rates

O19 p19 alliance permits reserve-to-Dune and cross-shipment only. FAQ20 p9 explicitly says Guild allies can no longer return to reserves. DZ1 p41 `25R4/S8LE` says they cannot. N26 p33 allows all three, including board-to-reserves, even for Fremen. DZ2 p55 `3ESE/78NX`. Confirmed permission change. The ally's cross-shipment also follows new full-price Guild Rates rather than old half price. Fremen cross-shipment from its off-board on-planet reserves was already FAQ20 p5, so that capability alone is not new. Do not infer from this that every old Homeworld interaction is now automatically validated.

### F44. Special victory requires matching the leaders in stronghold control

O19 p19 is automatic if nobody won by game end. DZ1 p41 `25R4/F76P` allows the Guild fallback after Fremen's condition, under medium-confidence judgement `GF9-CORE-007`. N26 p33 requires an unallied Guild to control at least as many as the single highest faction, even if that faction is allied; an allied Guild must match the highest faction or alliance total. DZ2 p55 `3ESE/N5AF` and worked example `MDS2`. Confirmed major change, coordinated with new general end-game hierarchy. Example: solo Guild2 ties Atreides2 and wins even when Atreides has a BG ally controlling1. If Guild instead has an Emperor ally, Emperor must supply1 so both alliances total3. Do not conflate this special win with the later general most-strongholds tiebreak.

### F45. Fold Space remains the Advanced timing ability

O19 p19 Advanced and N26 p33 both let the Guild take its whole shipment/movement turn first, last or between other players without announcing in advance. DZ1 p41 `25R4/ULAH`; DZ2 p54 `EPLF/Y3VV`. Checked nonchange for Advanced players, now part of the unified game for Basic players. Its narrowed Karama vulnerability has a new explicit deadline, summarized below.

## All six cancellation windows

N26 p24 limits Karama to each faction's one named vulnerable advantage. This replaces the many cancellable actions in FAQ20 p7 and DZ1 p45 `JN3K/X6T9`. The broad-to-narrow change is the common lesson; use the faction-specific timings below. Do not claim formerly exposed income, movement, token strength or advisor actions remain cancellable merely because the old book listed them.

| ID | Faction | New vulnerable advantage and window | Production locator | Earlier contrast |
| --- | --- | --- | --- | --- |
| K-F01 | Atreides | Battle Prescience, immediately after Atreides names the element it intends to see. | DZ2 p50 `QJWF/2VJ3`; N26 p31 | Old list also exposed auction inspection, Spice-card inspection and using KH. Wording cancellation occurs before the requested reveal, not after gaining the information. |
| K-F02 | Bene Gesserit | Voice, immediately after its command. | DZ2 p42 `W68K/HQB2`; N26 p27 | Old list included free advisor, flipping, Charity and Worthless conversion. Those no longer appear in the narrowed list. |
| K-F03 | Emperor | Sardaukar count as standard forces for this battle, while Battle Plans are being formed. | DZ2 p48 `GP27/BTHR`; N26 p30 | Old list additionally exposed card income, gifts and extra allied revivals. Source p24 says before plans are made; sheet says while being formed. Do not wait until reveal. |
| K-F04 | Fremen | Cancel free spice strength for this battle; Fremen may still pay spice normally. | DZ2 p46 `SHV2/K2BB`; N26 p29 | Old list could instead cancel movement, worm protection/riding, Storm insight or Fedaykin doubled value. Those are no longer cancellation options. Same p24 before-plans versus sheet while-formed wording difference as Emperor. |
| K-F05 | Harkonnen | Capture Leaders immediately after battle win, before drawing the captive. | DZ2 p52 `SVS5/3RX4`; N26 p32 | Old list also exposed extra Treachery draws and ally traitor calls. Normal own traitor calls remain outside cancellation. |
| K-F06 | Spacing Guild | Fold Space makes it take normal order; cannot play Karama after its normal turn has passed. | DZ2 p54 `EPLF/6QYT`; N26 p33 | Old list exposed payments, discounts and shipment types too. Historical judgement `GF9-CORE-019` already enforced normal order after cancellation, but the new card timing requires acting before Guild has deferred its normal place. Do not attempt retroactive cancellation after Guild has passed. |

## Spirit World alternate triggers

### F46. Optional alternate trigger for the same once-per-game power

N26 p26 introduces this variant. Discard your faction's named card instead of an actual Karama to trigger the same once-per-game power. Discarding that card normally does not trigger it. You cannot discard another faction's named card for their benefit, and cannot use the named card to cancel a rival's vulnerable advantage. It does not grant a second use after using a Karama.

| Faction | Named card | New source | DZ2 locator | Old power comparison |
| --- | --- | --- | --- | --- |
| Atreides | Family Atomics | p31 | p51 `44R2/ARGS` | Same whole-plan inspection. |
| Emperor | Cheap Hero | p30 | p49 `CBT5/TCHT` | Now four forces and one leader, F37. |
| Fremen | Harj | p29 | p46 `SHV2/245Q` | Revised drawn-worm placement, F34. |
| Harkonnen | Solaris | p32 | p53 `ECSZ/EFKZ` | Replaced table-wide Vendetta, F40. |
| Guild | Weather Control | p33 | p54 `EPLF/MQF8` | Same Blockade shipment stop. |
| Bene Gesserit | None | p28 | p44 `27N9/XM9Y` | No once-per-game special Karama. Transmutation is a separate repeatable advantage. |

## Coverage and checks that should not become invented changes

- All six starting forces, spice, Treachery counts and free revival rates checked. Apart from Fremen spice and Guild setup, retain the old Advanced starting quantities.
- Atreides bidding inspection and exclusive written Treachery tracking are retained. The general ban on other notes belongs in the core comparison.
- BG ability name changes alone are not mechanics. Prediction still targets one other faction and one round and can replace an ally's normal victory. Lack of advisor combat, collection, blocking and ornithopter benefits is retained.
- Fedaykin and Sardaukar strength2, special-token counts3 and5, and Sardaukar weakness against Fremen are retained from Advanced. Changed combat-spice arithmetic must be explained elsewhere rather than presented as those units changing numerical strength.
- Fremen deployment range, two-territory Sandwalk, worm immunity and free three-force revival remain. New p29 does not grant an ordinary ability to pay for unlimited extra revivals.
- Emperor income still takes other players' card purchases at full price, own purchases to Bank. New allied-contribution examples and phase-end gifting change the timing and destination of funds, not the income rule into a discount.
- Harkonnen eight-card limit, two starting cards, mandatory purchase bonus when room exists, four kept traitors after any allowed redraw, and two-spice captive execution payment remain.
- Guild income on other off-planet shipments, three possible shipment types, one free revival and its one-shot off-planet Blockade remain. The reserve return ally permission and cross-ship price do change.
- The 2.0 book names older expansion factions/cards in interactions but does not supply replacement rules for all six expansion factions. Do not claim their full old sheets are re-certified. Homeworld, Nexus card and other module effects need their own explicit compatibility scope.
- Some apparent source errors remain errors, not new rules. N26 p30's sample begins with "Sardaukar and two standard forces" then refers to "both Sardaukar" in its dial4 loss option. Do not base a new teaching example on that inconsistency. The source p26 old wheel8½ issue is also retained in the as-is reproduction and should not become an invented new arithmetic rule.
- Formal tensions to carry into the questions ledger are BG advisor/ally exemption versus p21 constraint; p24 before-plans timing versus sheets' while-formed timing; Harkonnen Vendetta edge cases; and any requested Classic Spice Dialing interpretation of Emperor ally discount. None requires silently modifying the as-is published book.

## Suggested priorities for later teaching design

Lead faction reminders with the actions players must unlearn. BG Voice and advisor flips, Guild cross-shipping/initial placement/stall condition, Emperor ally replacement and Karama buff, Harkonnen traitor redraw and new Vendetta, Fremen storm entry/free spice strength/allied victory, and Atreides public counter/revival timing deserve examples. Put leader renames in a component crosswalk, and distinguish Duncan2→3 and Guild's extra strength point from cosmetic changes. The exact book structure is a later product choice.
