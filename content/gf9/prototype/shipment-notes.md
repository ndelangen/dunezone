# Shipment and Movement teaching samples

Four C-only square pages use existing text, table, callout and board-scene Blocks. Component and map illustrations sit beside the rule or worked example they explain. No shared renderer, schema or production data changes are required by these fixtures.

The first example is a position during a game, not Emperor's starting setup. Emperor has 6 spice and 3 forces in Tuek's Sietch. Direct shipment spends 6 spice and 3 reserves while retaining that position. City access spends 1 spice and 1 reserve, then commits the older group and its movement. Existing piece-transfer diagrams distinguish the paid shipment from the free on-planet movement. Neither choice is declared universally better.

The route Tuek's Sietch, Pasty Mesa, Shield Wall, Imperial Basin follows the supplied original GF9 movement example. All three shared borders were checked against `src/shared/boards/arrakis.json` through the existing geometry derivation. Waypoint and troop positions are interior points in the supplied board geometry. They position a game diagram, never a paragraph.

The storm comparison uses a 70-degree storm sector. The direct Imperial Basin waypoint at 0.52, 0.28 is in that territory but outside the storm. The following segment crosses the storm and receives the blocked mark. The alternate route Carthag, Arsunt, Polar Sink, False Wall East has three verified shared borders and avoids the storm. The existing renderer masks the Polar Sink from its storm overlay.

The stronghold examples use Guild alone, then Guild and Atreides. Emperor can enter the first but cannot enter or cross the second. The ordinary troop anchors are verified inside Carthag. Advanced advisors and allied coexistence are explained separately.

The collection example uses the same 2 Hagga Basin forces beside 6 spice. Six existing spice glyphs, each representing 1 spice, use the board-scene's placed-token support. They are diagram markers rather than a new published token face. The forces and glyphs are in the same sector. Without city occupation they take 4; with a surviving Arrakeen force they take 6. Collection neither moves nor removes the forces. Basic play supplies no separate city-income payment. Holding city access when movement begins and holding it at collection are separate checks.

Dreamrules pages 22–26 inspired the progression from shipment to range, storm restrictions and stronghold entry. GF9 mechanics come from the existing reviewed core manuscript sections for shipment, movement, collection, battle and victory. No Dreamrules faction mechanics were imported.

These fixtures still require browser and PDF inspection for clipping, figure scale and reading order. Map routes illustrate authored legal examples; they do not calculate legality. Exact physical page dimensions and publication remain the enclosing prototype's responsibility.
