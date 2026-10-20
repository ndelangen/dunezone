# Full-name card header comparison

This prototype keeps the existing TraitorCard and AllianceCard bodies, portraits, strength values and symbols. It replaces only the two text layers in each proposed header. All CSS changes are scoped to `gf9-header-*` classes.

The current Traitor and Alliance renderers use a 640-unit title box at 60 units. The icon begins at approximately x = 674, while the title begins at x = 95. The title box therefore extends into the icon area. The shared CardHead renderer has a different sizing helper and is not used by these two card types.

Treatment A measures the actual loaded Copperplate font in Canvas and fits the full name within 560 units, leaving about 19 units before the icon. Treatment B chooses a word boundary using those same measurements and allows two lines. Treatment C uses the space above the icon for the full name, then separates the card type and owner. The baseline uses the real current renderer without replacement text.

The three GF9 full names are restored by existing memberId for this comparison. Their memberIds, strength values, portrait sources and faction data are preserved. Bene Gesserit and Spacing Guild use their unprefixed names. The independent Play fixture examples are Margot Lady Fenring and the House Harkonnen alliance. These fixture files are read without modification.

`HeaderCardRenderer` renders the native 900 by 1263 component. `HeaderPrintCard` provides a complete 63 by 88 mm card and an optional larger header crop through `enlargedHeader`. The stock renderer's 900 by 1263 ratio differs slightly from 63 by 88 mm, so the exact-size frame scales the two axes by factors that differ by less than 0.5 percent. Both the baseline and proposals receive the same scaling.

Exported fixtures are `headerFixtures` and `headerRegressionFixtures`. `headerTreatments` provides labels for baseline and A, B, C. Every rendered card exposes `data-measured`, `data-name-natural-width` and `data-name-available-width` for inspection after fonts load.

The missing capability is renderer-owned full-name fitting or a selectable header layout for derived Traitor and Alliance cards. The prototype does not add author-entered coordinates, abbreviations or a second display name. It makes no production changes.
