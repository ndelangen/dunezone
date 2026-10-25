# Reconstructed draft

The saved Square draft has 61 pages, using existing Blocks and the restrained design. Production draft revision 9 uses the native faction-sheet connection deployed in PR #2477. Central owns the Rulebook, assigned through GF9 2.0 to GF9. The reconstruction is published as Edition 2. See [the release and verification record](published-edition-2.md).

The original transcripts remain unchanged. Ten readings confirmed from the clearer supplied scan are applied by the builder and recorded in [the scan review](../clearer-scan-review.md). All 971 source units are accounted for. The current reading copy has no remaining uncertainty markers. That count is not a claim that every word has been rechecked against the newer scan.

## Production artwork

The overview now uses six native Faction introduction Blocks and six second-edition faction records. Their thirty leader tokens, six ruler tokens and six faction emblems are published. Duke Leto, Lady Anirul, Bashar Garon, Colonel Kolona, Wensicia and the five Guild leaders have their intended artwork. The older GF9 records are unchanged.

The six records were created through the authenticated import flow under Central, assigned to GF9 and linked to GF9 2.0. Fremen's structured starting-spice value was corrected to 4 to agree with its source setup paragraph. [The package](../components/overview-factions-package.json) and [saved record snapshot](../components/production-overview-factions.json) retain their identities and source data.

## Visual adaptations

- The native faction rows restore four factions on the first overview page and Guild/Harkonnen above the objective on the second.
- The maintained board and existing marker legends replace the photographed board and its arrows. Labels outside that circular board remain in text.
- The component wheels use the existing wheel pair with no faction emblem selected. Its casing and empty-leader presentation remain native. The source's exploded assembly is explained by its retained paragraph.
- One numbered List Block shows all nine phases with existing phase icons. It occupies a full-width Step-by-step page. Printed page references remain bold at the start of each description.
- Classic dialing uses separate loss diagrams with equal-sized published piece images and a real production spice token. Each diagram sits beside its matching explanation. The paired wheels show 2½ and 4½, and a callout retains all three printed settings, including 8½. There is no invented 8 comparison. The three variant pages separate the rules, losses and Spirit World Karama at the existing text size.
- The revival page keeps the general rules in the left column and the actual production faction sheet in the right column. The existing AssetExplainer points to its free-revival value. The rejected prose-only reference page is removed. The other 60 pages are unchanged.
- The setup extract still uses an existing text callout. Revival now uses the native sheet renderer. Full cards retain readable card wording beside battle and Treachery explanations.
- Source page references remain unchanged. The navigator and source map locate their reconstructed pages.

The approved printed contents and physical box-inventory omissions remain in effect. The preface quote shares its page with the prose. Credits start on their own page, acknowledgements use regular weight, smaller headings use sentence case, and continuation pages have no repeated banners. Each faction's detailed rules begin on a fresh page.

## Verification

The raw JSON passes the application schema and reference checks and stays below the JSON Load limit. All 61 pages were measured with no overflowing regions. A native Chromium review PDF contains 61 Square pages with selectable text. Its Revival page was rendered and inspected after fixing embedded sheet sizing under print styles. All referenced images were loaded before capture.

The saved production record is revision 7. It was loaded and saved through the authenticated editor as Central, then reloaded and exported. Its settings and contents exactly match the local manuscript. The live marker lands inside the sheet's revival line, and its referenced images are loaded. Deployment run 40043971581 passed; the production renderer reports Git SHA `c9379d1d50151396502bbf4f100fc2abb867f41e`. Rejected revision 6 is backed up in [correction/rejected-revival-r6.json](correction/rejected-revival-r6.json). Draft revision 5 is backed up in [correction/before-revival.json](correction/before-revival.json). The earlier cover and overview baseline remains in [correction/before-overview.json](correction/before-overview.json). The differences rulebook remains separate work.

## Revision 8 corrections

[The first correction pass](easy-fixes-r8.md) fixes the ornithopter caption, battle-example leader and comparison captions, stronghold income annotations, and cover framing lines. It also restores Solaris's bank-payment option in readable text beside the clipped image. Five pages changed. The saved revision 8 export exactly matches the local manuscript. The board explanation and clipped card images remain.

## Pending publication candidate

The [publication candidate](publication-candidate/README.md) prepares the last board-page correction and fitted Solaris and Family Atomics cards. All 61 candidate pages fit. These changes have not been applied to production; the saved production export remains revision 8. Applying them through the CLI requires the administrative-write confirmation in AGENTS.md because browser controls are unavailable.

## Edition 2 publication

The user approved the prepared administrative scope. The board correction and fitted production card images are applied, draft revision 9 is saved, and Edition 2 is published. This supersedes the pending status above. The [release record](published-edition-2.md) links the ready reader, HTML and PDF, with final verification. The separate differences rulebook remains open work.
