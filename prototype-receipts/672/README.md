# Formatted-text print-renderer prototype receipts

Prototype for [#672](https://github.com/ndelangen/dunezone/issues/672). The inputs came from the read-only `dev:tame-raccoon-541` clone on 2026-08-25T09:38:48.213Z. The capture uses the actual publisher bundle and fixed publication geometry.

The full sweep covers every live faction and treachery card in the clone. The contact sheets show all three faction documents with stored list syntax, the two other largest faction changes, one dense faction, and three paragraph-heavy cards. A changed pixel means one or more RGB channels moved by more than 8 levels.

- [Faction sheet comparisons](./faction-sheets.jpg)
- [Treachery card comparisons](./treachery-cards.jpg)
- [Focused Emperor-CHOAM inline fields before and after](./emperor-choam-header-before-after.jpg)
- [Focused Richese inline setup before and after](./richese-header-before-after.jpg)
- [Focused Emperor-CHOAM before and after](./emperor-choam-before-after.jpg)

Sweep summary:

- Faction sheets: 70 renders, 62 pixel-identical, 8 changed, maximum 10.214%.
- Treachery cards: 9 renders, 9 pixel-identical, 0 changed, maximum 0.000%.

Changed renders:

| Source | Published asset | Pixel change | Changed bounds |
| --- | --- | ---: | --- |
| combine-honnete-ober-advancer-mercantiles, page 1 | faction_sheet | 4.727% | 63,780 to 2036,1542 |
| emperor-choam, page 1 | faction_sheet | 3.145% | 62,1503 to 1004,2307 |
| hivers, page 1 | faction_sheet | 0.799% | 63,1292 to 999,1475 |
| house-richese, page 1 | faction_sheet | 2.852% | 62,2016 to 1011,2634 |
| moritani-ecaz-moritani, page 1 | faction_sheet | 10.214% | 1080,881 to 2036,2349 |
| ocm, page 1 | faction_sheet | 2.209% | 63,1536 to 984,2155 |
| richese, page 1 | faction_sheet | 0.015% | 618,222 to 1935,287 |
| the-smugglers, page 1 | faction_sheet | 7.505% | 61,856 to 2036,1659 |

Revision and recapture scope:

- `faction_sheet` must move from revision 8 to 9 and republish 35 live faction sheets because the list cases visibly change.
- `card-treachery` stays at revision 1. All 9 live captures are pixel-identical, so a bump to 2 would only recapture byte-identical faces. New saves use the replacement renderer without a revision bump.
- Decks and tokens do not import the prose renderer, so their revisions stay unchanged.
