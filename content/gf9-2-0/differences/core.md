# Core comparison research, GF9 2019 to GF9 2.0

Researched 26 October 2026. This is preparation for a differences-only book. It does not teach the unchanged game. Faction-specific powers and card inventories belong in the other research passes. Cross-references below identify where those powers affect a core procedure.

## Sources and identity

- O19, the original 2019 GF9 base rulebook, freshly retrieved from the [Treachery.online mirror](https://raw.githubusercontent.com/ronaldossendrijver/treachery.online/master/Client/wwwroot/docs/Dune-Rulebook.pdf). SHA-256 `6c55d28e93b6948a34d20b0f50e1087494e06f237f8c43e7e4c0cac3810b752d`, 24 pages. Page numbers below count from the cover and agree with the printed page numbers here.
- F20, the official November 2020 FAQ, freshly retrieved from the [supplied attachment](https://github.com/user-attachments/files/33447700/Dune-FAQ-Nov-2020.pdf). SHA-256 `b6dc77d7778fb0fee800e3995e6fbf620531f7a6b1fd32af2303266f60bf2039`, nine pages.
- N26, supplied second-edition clearer scan, `content/gf9-2-0/source-clearer.pdf`, 36 pages, SHA-256 `c681228eaa328fc146cf273c3634216c29140c72be41723730b4c8989f7827ff`. The original reworked transcript remains historical. The current manuscript applies ten clearer-scan corrections recorded in `clearer-scan-review.md`. I visually checked source pages 14 and 20 in this pass, including the surprising one-sector movement wording and victory hierarchy.
- DZ1, live [Dune Zone GF9 core rules](https://dune.zone/rulesets/gf9/rulebooks/dune-core-rules?edition=2), Edition 2, 50 pages. Page and anchor references below refer to this exact snapshot, not the historical 45-page `core-rules.json` import. Supporting judgement history is `content/gf9/core-judgements.json`.
- DZ2, live [Dune Zone GF9 2.0 rulebook](https://dune.zone/rulesets/gf9-2-0/rulebooks/gf9-2-0-rulebook?edition=3), currently Edition 3, 61 pages. This research pins publication Edition 3 as read today. Source page references below are still the physical N26 page numbers, and a separate digital page number or anchor is supplied where useful.

The texts read in this pass cover O19 pages 6-14, 22-24 and the relevant faction/strategy material, all N26 core pages 8-26 and terminology page 36, F20 core sections, and all corresponding current DZ1 and DZ2 core text. New source page 3 explains that the Basic/Advanced split is being replaced by one default system. N26 page 26 retains Classic spice dialing as a variant. This matters for every comparison with an old Advanced-only rule.

## Classification index

Core findings use the `CORE-` prefix. The classification table abbreviates that prefix.

| IDs | Classification | Note |
| --- | --- | --- |
| C01-C02 | mechanically changed | Default game structure and setup order. |
| C03 | wording-conflict | Lowest-first instruction reverses the old highest-first method, but the new sentence also says descending. |
| C04-C12 | mechanically changed | C12 is a clear reversal of the current Dune Zone ruling; older printed text was less explicit. |
| C13 | clarified-existing | New explicit traitor-winner leader reuse; earlier rulebook did not spell it out, so historical practice is not proven different. |
| C14-C21 | mechanically changed | Some changes are relative only to Basic or the clarified Dune Zone baseline; see each entry. |
| U01-U06 | wording-conflict | Verified wording or unresolved interaction, not a clean teaching rule yet. |
| Q01-Q03 | clarified-existing | Already clarified or implied in the older game. |
| Q04-Q06 | unchanged | Repeated old rule, not a new mechanic. |
| Q07-Q08 | clarified-existing | More explicit prose for an existing procedure. |
| Q09-Q10 | unchanged | Already official FAQ and Dune Zone rules. |
| Q11-Q12 | clarified-existing | Explicit surrender template and renamed initiative. |
| Q13-Q15 | clarified-existing | Edge cases or card-specific exceptions codified. |
| Q16-Q18 | unchanged | Already applicable to Dune Zone's GF9 rules. |
| Q19 | clarified-existing | Existing expansion territory exception. |

## Findings and practical consequences

These entries are source-backed; C03 records a source contradiction rather than a settled instruction. A change from the literal 2019 book is not automatically a change from the 2020 FAQ or today's Dune Zone GF9 book. Each entry says which baseline changes.

### CORE-C01. One default ruleset replaces Basic and Advanced

Old: O19 pages 6-12 give Basic, pages 13-14 add double spice blows, stronghold income, paid force support and special Karama powers. DZ1 pages 2 and 8 retain that distinction.

New: N26 page 3 announces a unified system. Pages 11, 17 and 20 include the new spice procedure, spice-strength combat and stronghold income in the default rules. Page 26 moves old Advanced combat into a named variant. This is a confirmed structural and mechanical change for both old Basic and Advanced players.

Teaching effect: do not say merely "use Advanced rules." A Basic player gains several default procedures. An Advanced player must replace combat and the double-pile spice process. Special powers must be taught from their new faction text rather than imported wholesale.

### CORE-C02. Treachery cards are dealt before traitor selection

Old: O19 page 6 setup orders Positions, Traitors, Spice, Forces, then one Treachery card. DZ1 setup follows that older sequence, with faction exceptions.

New: N26 page 8 orders Positions, Treachery, Traitors, Spice, Forces, then markers. Treachery count comes from the faction sheet. DZ2 digital pages 8-9, `source-08`, retain this.

Teaching effect: veterans should perform the new setup order. They know their initial hand when choosing a traitor. Faction-specific starting counts still apply; Harkonnen starts with two cards in both editions.

### CORE-C03. Faction selection priority reverses for the prediction-card method

Old: O19 page 6 has the highest drawn prediction card choose first.

New: N26 page 8 says start with the lowest card. Its wording also calls this "descending" order, which is inconsistent with the stated starting point. The operational instruction is lowest first; retain the contradiction as an editorial note rather than silently rewriting the source.

Teaching effect: the instruction starts with the lowest card, but its order word contradicts that instruction. Keep this optional selection method qualified until the inconsistency is resolved. Random faction assignment remains available.

### CORE-C04. Later storm movement uses a shared nine-card deck

Old: O19 page 7 uses the last two Battle Wheel users' 1-3 dials after the first storm. Advanced Fremen is an exception using its own storm cards, O19 page 16. DZ1 page 9 explicitly preserves this conditional deck and reject an unofficial always-deck house rule, judgement GF9-CORE-004.

New: N26 pages 7, 8 and 10 give a shared Storm deck and use it for later rounds regardless of whether Fremen is present. Cards are discarded; three cards instruct a reshuffle after movement. One card instead calls for the two last wheel users to dial 1-3, with a fallback if no battle occurred in the previous round. Deals about that particular later dial are allowed.

Teaching effect: stop automatically dialing every later storm and stop letting Fremen's old deck procedure set the core storm. Explain the discard/reshuffle instruction and dial card. Initial 0-20+0-20 placement is unchanged, except new explicit coordination wording below. Confidence high.

### CORE-C05. Battles can occur while both sides share the stormed sector

Old: O19 page 7 says no battle if either force is in storm. F20 page 1 explicitly forbids battle in a stormed stronghold, rock or Imperial Basin. DZ1 pages 9 and 24 keep the old blanket prohibition.

New: N26 pages 10 and 16 explicitly require a battle when both sides are in the same stormed sector of a rock or stronghold territory. If only one side is in storm, or the two sides are separated by storm, they still cannot battle. DZ2 digital pages 12 and 22.

Teaching effect: two rivals under the same storm sector in a protected stronghold now fight. Do not import the old FAQ's "under storm means no battle" shorthand. High confidence, direct reversal of F20.

### CORE-C06. Paired spice territories replace one Basic blow or two Advanced piles

Old: O19 page 8 uses one territory card and one discard pile. Advanced O19 page 13 uses separate A and B draws and piles. Each worm attacks the previous territory in its own pile. DZ1 digital pages 10-11 resolve each Advanced pile fully, including its Nexus and rides, before the other.

New: N26 page 11 places spice in both territories printed on one card and uses one discard pile. A Shai-Hulud attacks the territories shown by the previous face-up blow, then replacement draws continue to an ordinary Spice Blows card. Each affected sector is individually checked for storm. One territory being stormed does not cancel the other territory's blow.

Teaching effect: an Advanced player must stop using two independent histories and two per-pile Nexus windows. A worm can erase both territories of the previous paired blow. The Fremen exception for additional worms still needs its own faction explanation. High confidence.

### CORE-C07. Little Maker adds a different Nexus and spice event

Old: no Little Maker in the O19 base deck. Do not confuse this with the first expansion's Sandtrout, which has different rules.

New: N26 page 11 adds a 10-spice blow placed by the last player in storm order at a vacant, nonstorm Spice Blow symbol, and causes a Nexus after round one. It is not Shai-Hulud, causes no worm devouring and gives no worm ride. During a worm's replacement-draw sequence, Little Maker is discarded without effect. On the first round, all non-Spice-Blows cards are set aside and reshuffled afterward.

Teaching effect: show a short Shai-Hulud versus Little Maker comparison, including who chooses the blow and that the latter cannot be used for worm-based powers. High confidence. The prose's reference to a prior Little Maker when a later worm appears needs the unresolved note below.

### CORE-C08. Leader revival no longer cycles through the whole roster

Old: O19 page 9 requires all five leaders in the Tanks before ordinary revival, then revives one per turn. A twice-killed leader goes face down and must wait until the other revivable leaders have completed their own revival/death cycle. F20 and O19 Q&A page 22 include captured leaders in the eligibility condition. DZ1 page 17 keeps the cycle and captured-leader eligibility.

New: N26 page 13 counts leaders dead or captured when first opening ordinary revival. Place the second faction token in the Tanks to remember that eligibility has opened. Once open, choose any dead leader each round, including a leader revived previously. DZ2 page 16.

Teaching effect: after unlocking normal revival, you may repeatedly revive the same valuable dead leader. Do not turn it face down to lock it behind the rest of the roster. One leader per ordinary Revival phase and printed-strength payment remain. Captured-leader eligibility was already clarified in the old game; the removal of cycling is the major new rule. High confidence.

### CORE-C09. Spice support becomes a bonus to full dialed strength

Old Basic: O19 pages 10-11, ordinary force strength plus surviving leader, with no spice support. Old Advanced: O19 page 13, one spice supports each token to full strength, unsupported strength is half. DZ1 page 29, `advanced-battle`, uses that token-support model and half increments.

New default: N26 pages 16-18 gives full dialed force strength and optional spice strength. Dial at least 2 to spend 2 spice for +1; at least 4 to spend 4 for +2; at least 8 to spend 8 for +3. These are alternative tiers, not cumulative purchases. Double-strength special forces count by their dialed strength when satisfying thresholds. DZ2 page 24, `source-17`.

Teaching effect: four ordinary committed forces contribute 4 without any spice, or 6 with the 4-spice tier. An old Advanced player must stop halving unsupported troops. An old Basic player must add the optional spice choice. Force losses still follow the dial, not the spice bonus. A battle can be won by full-dialing and leaving no survivors. High confidence.

### CORE-C10. Commit and pay the new spice strength at reveal, from spendable holdings

Old Advanced: support spice accompanies the battle wheel, paid win or lose except the traitor winner. Old Basic has no equivalent expense. DZ1 already forbids using deferred bribes or general allied aid for support.

New: N26 page 17 makes the spice indicator secret until simultaneous reveal and pays then. The player must already have the spice; ordinary allied payment and later leader-kill income cannot fund it. Page 19 returns/retains committed spice for the traitor winner, loses it for the betrayed side and for both sides on dual traitors. Solaris and faction powers provide specific exceptions.

Teaching effect: teach dial, optional spice tier and surviving leader as separate parts. Do not use a newly earned leader bounty to purchase the tier. The old traitor asymmetry persists in the new payment system. High confidence. The source's "pay at reveal" and "keeps committed spice" should be explained as the stated exception, without inventing a separate new timing window.

### CORE-C11. Leaderlessness is no longer announced before plans reveal

Old: O19 page 10 and DZ1 page 24 require a player unable to use a leader or Cheap Hero to announce that fact.

New: N26 page 16 explicitly says no such prior announcement is needed. DZ2 page 22.

Teaching effect: an opponent no longer gets that free information before forming its own battle plan. No leader still means no Treachery cards inside the battle plan. High confidence. Cheap Hero optionality is internally inconsistent and must be handled separately below.

### CORE-C12. A later lasgun/shield explosion kills earlier surviving leaders too

Old: O19 leaves surviving leaders in the territory as markers and its page 22 explosion answer explicitly covers forces and spice. Those printed statements did not settle earlier leaders. The collected later designer explanation adopted by Dune Zone expressly protects them, judgement GF9-CORE-012. DZ1 page 27, `weapons`, repeats that protection.

New: N26 page 17 explicitly kills face-up leaders which survived earlier battles in the same territory. DZ2 page 25.

Teaching effect: your leader can survive battle one, remain beside the territory, then die when another pair detonates a lasgun/shield there. Mark this as a verified change from Dune Zone's current adopted ruling, and an explicit resolution of earlier printed ambiguity. Do not falsely say the bare 2019 base book clearly promised the opposite. High confidence against DZ1.

### CORE-C13. A traitor victory releases the winner's leader for another territory

Old: O19 page 10 restricts a leader to one territory, while page 11's traitor result says the winner loses nothing. The core printed result does not expressly grant reuse elsewhere. DZ1 pages 24 and 28 do not give a different-territory exception.

New: N26 pages 16 and 19 explicitly allow the traitor winner's leader in a different territory that round. DZ2 page 28.

Teaching effect: after winning through a traitor, your leader is not committed to that battle's territory. Label this explicit new guidance compared with our old book, not proof that every old tournament already played it differently. Confidence high for the new text, limited for historical custom.

### CORE-C14. Stronghold income becomes default, with a new control term

Old: O19 page 13 makes Arrakeen/Carthag +2 and Tuek's +1 an Advanced-only rule; Basic does not collect it. It pays each occupant. DZ1 page 30 follows that split and occupant wording.

New: N26 page 20 pays the same amounts in the default game and says "controls" the stronghold. Page 36 defines control as sole occupation at the end of the round; advisors do not interfere. Carryalls still use occupation and their 3-spice-per-force rate is not new.

Teaching effect: Basic veterans must collect city income. Advanced veterans retain the amounts. Do not change collection rate or call Carryalls a new mechanical benefit. There is a real timing ambiguity between phase-8 income and the end-of-round control definition, noted below. The safe source-backed distinction is that control is exclusive, unlike mere occupation. High confidence for default income; interpretation needed for timing in exceptional disputed positions.

### CORE-C15. Simultaneous wins use a hierarchy instead of an automatic shared win

Old: O19 pages 11-12 use normal 3/4 requirements. F20 page 1 says simultaneous qualifying players tie unless the group chooses another whole turn. DZ1 page 31 retains shared victory and explicitly rejects an unofficial extra-stronghold tiebreak, judgement GF9-CORE-009.

New: N26 page 20 lists priorities: unallied 3+ strongholds; unallied 2 and 3+ Tech tokens; alliance 5+; alliance 4 and 3+ tokens; alliance 4; alliance 3 and 3+ tokens. Within the applicable position, ties break by strongholds, forces in strongholds, then spice. Special conditions have their own timing and criteria. DZ2 page 31.

Teaching effect: expansion games with multiple qualifying sides no longer default to a shared win. A solo qualifying side can outrank an alliance under the listed hierarchy. Tech-token rows should be marked module-specific. Do not teach the old FAQ's automatic tie as current. High confidence, source page 20 visually checked.

### CORE-C16. Round-ten fallback is ranked instead of the old no-Guild defaults

Old: O19 page 23 says if nobody wins and Guild is absent, Fremen wins; if Fremen is also absent, most strongholds wins and tied sides share. Guild has an unconditional stall win on its old faction sheet, while Fremen has a territorial special condition. DZ1 page 31 keeps these as distinct rules and uses a recorded medium-confidence Fremen-before-Guild interpretation.

New: N26 page 5 says after round 10, if no normal or unique special victory applies, compare highest stronghold count, then unallied before alliance on a tie, then forces in controlled strongholds, then spice. Guild itself also receives a redesigned special condition, page 33, so the faction pass must explain that before the generic fallback.

Teaching effect: a veteran must stop assuming an automatic Guild stall or automatic no-Guild Fremen gift. Teach the faction special checks separately and then the new generic ranking. High confidence. Do not promise the rule settles a perfect tie remaining after spice; it does not give another tiebreak.

### CORE-C17. Newly allied co-occupants evacuate earlier and retreat to reserves

Old: O19 pages 12 and 23, F20 page 4 and DZ1 page 12 allow the first ally to remain. The later ally must leave or lose its forces to the Tanks. The old Dune Zone judgement deliberately preserves this over unofficial earlier evacuation rules, GF9-CORE-005.

New: N26 page 21 requires the first faction with a Movement action to leave. If it cannot, its forces return to reserves at the end of its turn. If somehow both still cannot leave by phase end, both return their co-occupying forces to reserves. DZ2 page 32.

Teaching effect: the later ally no longer bears the default evacuation burden, and the fallback is a retreat to reserves rather than casualties in the Tanks. High confidence. Bene Gesserit's new advisor permission is an explicit faction exception and must be cross-linked, not overwritten by the general rule.

### CORE-C18. Bribery and binding nonally deals are part of the default game

Old literal O19 page 12 includes bribery in Basic. F20 page 1 design-intent note relocates it to Advanced; DZ1 page 32 follows that change. Therefore this is not a new idea versus the 2019 printing, but it is a scope change from clarified Basic and current DZ1 Basic.

New: N26 page 22 includes it in the unified default. Spoken nonally deals are public and binding, can be unpaid, impossible parts are void, and all parties may cancel. Allied deals are explicitly nonbinding and cannot themselves transfer spice; normal legal payments and faction exceptions remain.

Teaching effect: Basic-only DZ1 users now play with the default paid-deal system. Advanced users already know most of it. Separate binding nonally deals from alliance promises, and direct gifts from legitimate ally payments. The actual delayed-bribe rule was already official in F20 page 3 and DZ1; do not present that delay as invented in 2.0. High confidence.

### CORE-C19. Mentat Pause forbids new bribes and Treachery cards

Old: O19 pages 11-12 do not give this explicit blanket phase ban. F20 says Truthtrance can be played any time and explains bribe collection at the start of Mentat Pause. DZ1 page 31 collects bribes and performs end-of-turn actions, without stating a general Treachery ban.

New: N26 pages 20 and 22 explicitly prohibit bribes during Mentat Pause; page 20 also prohibits all Treachery cards during that phase. DZ2 page 30.

Teaching effect: finish those card plays and bribes before the phase begins. Do not say old "Truthtrance any time" overrides this new explicit phase restriction. Specific expansion exceptions, if any, need separate checking. High confidence for the explicit new rule; absence in older text alone does not establish every former tournament practice.

### CORE-C20. General notes are prohibited, except Atreides' bidding record

Old: O19 page 17 reserves card tracking to Atreides. F20 page 9 permits general notes and discusses a stricter tournament option. DZ1 page 7 permits general private notes while reserving Treachery tracking to Atreides, judgement GF9-CORE-015.

New: N26 page 22 bans notes other than the Atreides bidding advantage. DZ2 page 35.

Teaching effect: a player using our GF9 core book must stop taking even noncard game notes in the default 2.0 game. This resembles the older FAQ's tournament restriction, but is now written as the default. High confidence.

### CORE-C21. Private information exchanges must be visibly announced

Old: O19 page 12 permits secret ally discussion, and F20 page 2 permits any players to communicate privately. No announcement requirement is stated there. DZ1 information and alliance sections allow private sharing.

New: N26 pages 21-22 and terminology page 36 allow secrecy but require everyone to know the transaction is taking place. It applies beyond alliances, including private messages and leaving the room.

Teaching effect: you may conceal the contents, but not conceal the fact that you are exchanging information. High confidence for new explicit procedure; do not claim the old game forbade such announcements.

## Verified new wording that needs careful interpretation

These deserve an open-question list before teaching them as clean changes.

### CORE-U01. Does one-sector movement reverse old multi-sector consolidation?

Old: O19 FAQ page 22 expressly allows forces in different sectors of one territory to move as one group. DZ1 pages 3 and 23 say the same, unless storm separates them.

New: N26 page 14 explicitly describes moving any number of forces **from one sector** to one sector of the destination. It separately forbids pickup/dropoff en route. I visually checked the clearer scan; "one sector" is genuinely printed, not OCR damage. DZ2 page 17 reproduces it. Page 16 still combines forces across sectors for battle, making movement and battle wording distinct.

Question: Is consolidation from multiple clear sectors of one territory intentionally removed, or is this a drafting simplification? Do not silently carry the old FAQ through this new restriction. In the dossier, record confirmed wording difference, probable mechanical change, intent not independently settled. A concrete example is two forces in each of two clear sectors of Hagga Basin: old rules can move all four together; literal new text can select only one sector's group.

### CORE-U02. Can you still ship onto your ally and then move away?

Old: F20 page 2 explicitly permits both passing through and shipping into an ally's territory if you move out afterward. DZ1 page 12 repeats this.

New: N26 pages 15 and 21 say factions cannot end an action or phase in a territory with their ally. Shipment and Movement are named distinct actions on page 14. Passing through during one Movement action remains legal, but a Shipment action would itself end with the ally before the later Movement action starts. DZ2 pages 17, 19 and 32.

Question: Does the new action-boundary restriction intentionally remove ship-then-move transit? Literal reading says yes, whereas a shorthand "you can pass through allies" would hide this difference. Keep this separate from newly allied forced evacuation and from Bene Gesserit advisor exceptions. The new text is clear enough to flag a likely reversal, but it never expressly discusses this exact old FAQ example.

### CORE-U03. Cheap Hero mandatory or optional when no leader disc is available?

Old: O19 page 10 says use a leader or Cheap Hero if possible. F20 page 9 calls mandatory Cheap Hero a clarification. DZ1 page 24 makes this mandatory.

New: N26 page 16 first says the Battle Plan must include a leader or Cheap Hero if possible, then its No Leader paragraph permits a player "unwilling" to include a Cheap Hero to battle without Treachery. DZ2 pages 22-23 reproduce both. It clearly removes the prior announcement, but the two new sentences conflict about mandatory consumption of the Cheap Hero.

Question: Is this an intentional choice to conserve Cheap Hero, or an unrevised sentence? Put it in the unresolved list. Do not teach optional Cheap Hero as an uncontested new rule. This is a source contradiction, not something our authoring format caused.

### CORE-U04. When is control tested for phase-8 stronghold income?

New: N26 page 20 awards income to the faction controlling a city. Page 36 says control is determined only at the end of the round and does not carry over. Phase 8 precedes the end-of-round Mentat Pause. The source likely intends sole occupation, but the exact timing wording conflicts. DZ2 pages 30 and 60.

Question: Teach income from the current sole occupant only after that interpretation is settled, especially where rivals are storm-separated in the same stronghold. Ordinary undisturbed occupancy causes no practical ambiguity. Preserve this as a textual issue rather than inventing an extra end-round payout.

### CORE-U05. What does a later worm destroy after Little Maker?

N26 page 11 says Wormsign destroys the territories determined by the previous face-up discard, including Little Maker. Little Maker can be placed at a chosen symbol rather than a territory printed on its card. The card image's generic worm wording refers to the top Spice Blows card. The exact record of Little Maker's chosen location and whether one looks past intervening special cards is not fully spelled out here.

Question: The book clearly intends Little Maker spice to be worm-vulnerable, but the teaching example should identify the chosen location and then confirm the intended discard-history handling. Do not infer that Little Maker itself attacks anything or permits worm riding. It does neither.

### CORE-U06. Remaining endgame ties and special-condition priority

N26 page 20 says special victories have their own timing and criteria, and page 5 excludes them before its generic endgame fallback. Neither provides an extra tiebreak after equal spice. The old Dune Zone Fremen-before-Guild ordering was a medium-confidence adopted judgement, not a settled 2019 hierarchy.

Question: Cross-check the new faction conditions against each other before publishing a total precedence chart. Cite the specific new rules and keep unresolved overlaps visible. Do not copy the older inferred priority merely because it appears in our old core book.

## Clarifications or carried-forward rules, not clean new mechanics

| ID | Topic | Old evidence | New evidence and teaching treatment |
| --- | --- | --- | --- |
| Q01 | Pick one of your own leaders as a safe traitor | O19 page 6 only offers your own if you drew no opponents; F20 page 3 explicitly allows choosing your own | N26 page 8 states the unrestricted choice. Changed from literal initial printing, already old FAQ and DZ1. Do not sell it as new for our veteran readers. |
| Q02 | Re-enter an auction after passing | F20 page 2 says yes, DZ1 page 15 says yes | N26 page 12 makes it explicit. Existing behavior. |
| Q03 | Full hand can become eligible after playing an action during bidding | General old hand-limit condition; DZ1 says a full hand cannot bid until space exists | N26 page 12 expressly allows it without adding a new auction card. Clarification worth a sidebar, not a newly expanded hand limit. |
| Q04 | Ten-second bid limit | O19 page 8 and DZ1 page 15 | N26 page 12 retains it. No change. |
| Q05 | Moving to another sector uses a move | F20 page 2 and DZ1 page 20/23 | N26 page 14 repeats it. No change. This is separate from U01's one-sector origin restriction. |
| Q06 | Shipping to a city immediately provides ornithopters for your subsequent move | O19 page 22 explicitly allows it, DZ1 movement examples repeat it | N26 pages 14-15 retain it. No change. |
| Q07 | No dropoff or pickup during movement | O19 gives one group from one territory to another, DZ1 expands it; no independent relay permission | N26 page 14 makes the ban explicit. Do not invent a new shorter movement allowance. |
| Q08 | General payment for an ally's purchase or shipment | O19 page 12, F20 page 2, DZ1 page 13 | N26 page 21 repeats it and explicitly makes a bid guarantee binding. It still does not create a common purse. Emperor's changed payment route and gifting timing belong in the faction pass. |
| Q09 | Deferred bribes | F20 page 3, DZ1 page 32 | N26 page 22 retains collection only in Mentat Pause. The delay is not new; the explicit ban on new bribes during that phase is C19. |
| Q10 | Impossible deal clause void, unanimous cancellation allowed | F20 page 9 and DZ1 page 32 | N26 page 22 puts it in the main rules. Clarification retained. |
| Q11 | Negotiated surrender | Old binding legal deal rule allows deliberately thrown battles; DZ1 legal deals and strategy support this | N26 page 22 provides an explicit template, including no traitor call, no weapons/defenses and optional Worthless disposal. It is an agreement between the players, not an automatic battle outcome, and terms can vary within their legal control. Treat as codified convention rather than a new permission to skip battle rules. |
| Q12 | Initiative instead of aggressor | O19 pages 10-11 and DZ1 page 24 use aggressor and award ties to it | N26 page 16 names Initiative and expressly permits leaving a multi-rival territory between battles and returning. The tie advantage and storm-order battle selection remain. |
| Q13 | First player exactly even with storm is last | O19 page 7 says next approached, without this edge case | N26 page 10 states it explicitly. A useful clarification. |
| Q14 | No collusion over the initial storm dial | O19 page 7 asks for secret dials but does not expressly discuss coordination | N26 page 10 prohibits coordination for first placement and expressly allows deals for the later dial card. Teach the distinction, without claiming that every old group allowed first-storm deals. |
| Q15 | Keep battle cards only where card text permits | F20 pages 1 and 8 add discard exceptions, including used Poison Tooth; DZ1 already distinguishes them | N26 pages 18 and 23 systematize card-specific retention and mandatory Action/Worthless discards. Do not say every old winning plan kept every card unconditionally. Card-by-card changes need the cards pass. |
| Q16 | Discard pile privacy | DZ1 page 7 already prohibits searching without permission; older base book says face up | N26 page 22 explicitly calls contents nonpublic and forbids search without an effect. Keep the narrower point: watching a discard is different from searching later. General notes ban is the actual change from DZ1. |
| Q17 | The 3/4 victory targets and Mentat Pause timing | O19 pages 6 and 11-12, DZ1 pages 2 and 31 | N26 pages 5, 20-21 retain the basic targets and timing. Changes concern competing winners and fallback, not a normal victory target of 4 for everyone. |
| Q18 | Stronghold blocking | O19 page 10, F20 page 2, DZ1 page 21 | N26 page 14 retains no entry or passage through a stronghold occupied by two other factions. The new rare-case >2-faction explanation on page 15 does not normally authorize a third faction to enter. |
| Q19 | Faction token inside Polar Sink can form a separate battle territory | Ixian expansion already supplies the Hidden Mobile Stronghold, not a new base faction | N26 page 16 spells out that the inner territory may host a battle even though ordinary Polar Sink remains a safe haven. Expansion clarification, not removal of Polar Sink protection. |

## Coverage and boundaries

Compared setup, phase sequence, storm, spice/Nexus, charity, bidding, revival, shipment/movement, battle determination, plans, payment, ordinary and traitor resolution, collection, normal/simultaneous/fallback victory, alliances, privacy, deals, notes, classic combat and glossary definitions. Core source labels such as round instead of turn, Initiative instead of aggressor, Screen instead of Shield, and Carryalls as a name for the existing collection boost are editorial changes with little play impact. Location renames and weapon terminology should live with the component/card inventory.

No production writes or source-document changes were made. No new book layout is proposed here. The dossier keeps source-linked change IDs, a separate clarification list and an unresolved-questions list. It must distinguish old Basic users, old Advanced users and readers of today's Dune Zone GF9 Edition 2.
