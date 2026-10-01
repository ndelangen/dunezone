# Troop detail prototype

Throwaway source for issue #1615. The user declined the first three layouts as too large. This revision explores compact, icon-led alternatives; no layout has been selected.

Run `bun run prototype:troops`, then open `/factions/house-atreides?variant=A&scenario=sample` on port 3198.

- A: compact cards, one short icon-and-number row per face.
- B: a compact token strip with front and reverse faces beside one another.
- C: a compact comparison list with icon-only column headings.

The floating bar and left/right keys switch variants. The data menu switches between saved public faction data and sample troop values. Samples are temporary, use the current faction's artwork, and do not change saved data. Other page content stays live. The sample counts belong only to the troop preview; the page header retains the saved faction's total.

All options use the existing Surface without the old horizontal lane's fade mask. Section owns the heading; Mantine Group, Stack, Divider, Text, Badge and Table arrange the content. The existing TroopToken renders the artwork. No new kit component is proposed.

The shared troopCombatFaces function supplies the combat contract: missing capability means capable, absent combat values remain unknown, funding cost defaults to one, and each authored reverse side has its own eligibility and values. Undialed maps to strength; dialed maps to fundedStrength. A missing strength is never displayed as zero.

The public House Atreides record currently has its strengths in descriptive text but no structured combat values. Saved mode therefore preserves the description and reports that the structured strengths are not set.

The browser review covered all three variants, URL updates, keyboard cycling, saved data, and 390px layouts. The comparison table scrolls within its surface on narrow screens. Type checking passed; no prototype test suite was added.

## Compact revision

Names and counts remain visible. Descriptions, eligibility explanations, missing-value messages, and metric names appear in tooltips. Counts use the multiplication sign, without a token label. Tooltips open on hover or keyboard focus.

TopicIcon owns every troop concept glyph. Flip uses the existing /vector/icon/flip.svg artwork, and battle and spice reuse their existing entries. Dialed, undialed, noncombatant and unknown combat values have entries in the same mapping. The TopicIcon catalogue story lists new entries automatically.

All three revised layouts were viewed at 1280px and 390px, with no page overflow. At 1280px, the complete troop sections, including the heading, measured 185px for A, 164px for B and 233px for C with three sample troop types and four faces.

Base decision: fetched main on 2026-10-01 and inspected the changes since the prototype base. They only concern CI selection and its documentation. Kept the established prototype base at 78283a2a9ff to continue this visual comparison, following the user's instruction to judge the impact of unrelated concurrent work.

Missing combat values use the same TriangleAlert glyph as ValidationHeader, in the caution colour. The question-mark glyph remains reserved for explanatory help.

## Paired-face revision

The user requested one strength glyph followed by an undialed | dialed value pair. The prototype now uses the mapped strength glyph and removes the separate dialed and undialed entries. The tooltip names both values.

An authored reverse face sits to the right of its front inside the same panel. A vertical divider separates the faces, with the mapped flip glyph in the middle of the divider. Counts remain shared. All three variants use this arrangement.

Fresh main changes through 3c3353181a4 concern CI and Play drafting, not this page or the icon mapping. Continued on the preserved prototype base.
