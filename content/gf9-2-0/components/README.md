# Rulebook component references

`production-cards.json` names the 15 full card records used in the Rulebook. The individual JSON files are snapshots of those records. `refresh-card-bindings.ts` refreshes them through public, read-only queries.

`production-factions-snapshot.json` contains only the artwork fields of the six existing production factions. `bind-factions.ts` resolves their tokens, leaders and troop faces for the local preview. It does not modify those factions or import their older rules into the manuscript.

`overview.json` supplies the second-edition names, strengths and compatible stock portrait choices. Eight unmatched portraits use existing faction emblems, as documented in the Rulebook review notes. The manuscript requires no additional artwork publication.
