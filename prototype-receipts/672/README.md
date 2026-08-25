# Formatted-text print-renderer prototype receipts

Prototype for [#672](https://github.com/ndelangen/dunezone/issues/672). The inputs came from the read-only `dev:tame-raccoon-541` clone on 2026-08-25T09:15:36.820Z. The capture uses the actual publisher bundle and fixed publication geometry.

The full sweep covers every live faction and treachery card in the clone. The contact sheets show all three faction documents with stored list syntax, the two other largest faction changes, one dense faction, and three paragraph-heavy cards. A changed pixel means one or more RGB channels moved by more than 8 levels.

- [Faction sheet comparisons](./faction-sheets.jpg)
- [Treachery card comparisons](./treachery-cards.jpg)
- [Focused Emperor-CHOAM before and after](./emperor-choam-before-after.jpg)

Sweep summary:

- Faction sheets: 70 renders, 35 pixel-identical, 35 changed, maximum 1.204%.
- Treachery cards: 9 renders, 9 pixel-identical, 0 changed, maximum 0.000%.

Changed renders:

| Source | Published asset | Pixel change | Changed bounds |
| --- | --- | ---: | --- |
| bene-gesserit, page 1 | faction_sheet | 0.026% | 294,355 to 564,419 |
| bene-tleilax, page 1 | faction_sheet | 0.033% | 294,355 to 584,419 |
| choam, page 1 | faction_sheet | 0.026% | 294,355 to 564,419 |
| combine-honnete-ober-advancer-mercantiles, page 1 | faction_sheet | 0.033% | 294,355 to 584,419 |
| corrino, page 1 | faction_sheet | 0.032% | 294,355 to 576,419 |
| ecaz-ecaz-moritani, page 1 | faction_sheet | 0.026% | 294,355 to 557,419 |
| emperor, page 1 | faction_sheet | 0.026% | 294,355 to 564,419 |
| emperor-choam, page 1 | faction_sheet | 1.204% | 63,355 to 1004,2013 |
| fremen, page 1 | faction_sheet | 0.032% | 295,355 to 582,419 |
| ginaz-swordmasters, page 1 | faction_sheet | 0.058% | 294,355 to 677,419 |
| hivers, page 1 | faction_sheet | 0.362% | 63,356 to 999,1517 |
| honored-matres, page 1 | faction_sheet | 0.032% | 294,355 to 583,419 |
| house-atreides, page 1 | faction_sheet | 0.032% | 294,355 to 583,419 |
| house-harkonnen, page 1 | faction_sheet | 0.032% | 294,355 to 583,419 |
| house-richese, page 1 | faction_sheet | 0.032% | 294,355 to 583,419 |
| iduali, page 1 | faction_sheet | 0.093% | 295,355 to 838,419 |
| ixians, page 1 | faction_sheet | 0.126% | 294,355 to 941,419 |
| ixians-in-progress, page 1 | faction_sheet | 0.053% | 294,355 to 659,419 |
| landsraad-council, page 1 | faction_sheet | 0.058% | 294,355 to 677,419 |
| mindwardens, page 1 | faction_sheet | 0.032% | 294,355 to 576,419 |
| moritani-ecaz-moritani, page 1 | faction_sheet | 0.026% | 294,355 to 557,419 |
| new-faction, page 1 | faction_sheet | 0.072% | 294,356 to 730,419 |
| nobirds, page 1 | faction_sheet | 0.072% | 294,356 to 730,419 |
| ocm, page 1 | faction_sheet | 0.053% | 294,355 to 659,419 |
| ordos, page 1 | faction_sheet | 0.064% | 294,356 to 692,419 |
| richese, page 1 | faction_sheet | 0.847% | 294,217 to 1999,601 |
| shrek, page 1 | faction_sheet | 0.072% | 294,356 to 730,419 |
| smugglers, page 1 | faction_sheet | 0.057% | 294,356 to 673,419 |
| space-orks, page 1 | faction_sheet | 0.240% | 294,355 to 1353,430 |
| spacing-guild, page 1 | faction_sheet | 0.026% | 294,355 to 564,419 |
| spice-smugglers, page 1 | faction_sheet | 0.052% | 294,355 to 658,419 |
| suk-medics, page 1 | faction_sheet | 0.052% | 294,355 to 658,419 |
| test-faction, page 1 | faction_sheet | 0.053% | 294,355 to 656,419 |
| the-smugglers, page 1 | faction_sheet | 0.057% | 294,356 to 673,419 |
| thinking-machines, page 1 | faction_sheet | 0.058% | 294,355 to 677,419 |

Revision and recapture scope:

- `faction_sheet` must move from revision 8 to 9 and republish 35 live faction sheets because the list cases visibly change.
- `card-treachery` stays at revision 1. All 9 live captures are pixel-identical, so a bump to 2 would only recapture byte-identical faces. New saves use the replacement renderer without a revision bump.
- Decks and tokens do not import the prose renderer, so their revisions stay unchanged.
