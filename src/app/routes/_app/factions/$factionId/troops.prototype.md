# Troop detail prototype

Throwaway source for issue #1615. No layout has been selected.

Run `bun run prototype:troops`, then open `/factions/house-atreides?variant=A&scenario=sample` on port 3198.

- A: separate troop cards with front and reverse sides grouped together.
- B: one comparison table, with strengths and cost aligned in columns.
- C: one compact roster with an undialed-to-dialed strength pair per face.

The floating bar and left/right keys switch variants. The data menu switches between saved public faction data and sample troop values. Samples are temporary, use the current faction's artwork, and do not change saved data. Other page content stays live. The sample counts belong only to the troop preview; the page header retains the saved faction's total.

All options use the existing Surface without the old horizontal lane's fade mask. Section owns the heading; Mantine Group, Stack, Divider, Text, Badge and Table arrange the content. The existing TroopToken renders the artwork. No new kit component is proposed.

The shared troopCombatFaces function supplies the combat contract: missing capability means capable, absent combat values remain unknown, funding cost defaults to one, and each authored reverse side has its own eligibility and values. Undialed maps to strength; dialed maps to fundedStrength. A missing strength is never displayed as zero.

The public House Atreides record currently has its strengths in descriptive text but no structured combat values. Saved mode therefore preserves the description and reports that the structured strengths are not set.

The browser review covered all three variants, URL updates, keyboard cycling, saved data, and 390px layouts. The comparison table scrolls within its surface on narrow screens. Type checking passed; no prototype test suite was added.
