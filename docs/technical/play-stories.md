# Play story migration

The [Storybook conventions](../README.md#play-page-stories) define the required product story set.
The [Wayfinder decision](https://github.com/ndelangen/dunezone/issues/1257) records the choices and
their source. This document maps the current collections to their destinations; it does not claim
that the migration has shipped.

## Story destinations

`Pages / Play` is the common prefix. A destination ending in a state name is a story; a stage or
Battles destination may contain several stories. Names below describe the intended grouping, not
a requirement to preserve every current export as a separate story.

| Current collection or scenario | Product destination | Migration |
| --- | --- | --- |
| Lobby and Create | Lobby and Create | Retain page-specific states; replace synthetic content with production copies. |
| Game provisioning and access states | Create or the affected game stage | Keep meaningful loading, refusal and access states beside the page they describe. |
| Game drafting scenarios | Drafting | One complete six-player baseline, with explicit exceptions for incomplete participation or an insufficient faction pool. |
| Game trading offers and deadline scenarios | Swapping | Keep offers, readiness and a vacancy at the deadline as distinct page situations. |
| Game setup, forces and prediction | Setup | Show valid setup states with real faction components and the current player's private information. |
| Game seat requests, departures and removal votes | The stage shown by the scenario | Use descriptive state names; do not duplicate the same feature under Game and Hosted. |
| Hosted phase, panel, inventory and bank scenarios | Playing / Controls and meaningful sibling states | Consolidate the normal page; retain distinct approval, privacy or responsive states where they change the reviewed behavior. |
| Hosted battle scenarios | Playing / Battles | Retain page-level planning, countdown, reveal, resolution, observer and table-placement cases; omit component-only repetitions. |
| Hosted card and private draw/deal scenarios | Playing | Use actual production cards and valid hands/decks; keep states that demonstrate page behavior. |
| Game conversation and log scenarios; Hosted history | Playing | Preserve the delivered conversation and Game/Audit behavior in one story set. Group only when several related states justify it. |
| Demo camera, controls and opening transition | The corresponding product page state | Move useful coverage to the actual game page; do not preserve a second demo story set. |
| Hosted eighteen-seat layout | The relevant stage's explicit crowded-layout story | Keep the count exception only to demonstrate that layout; six players remains the normal baseline. |
| Finished | Finished | Add the actual results/continuation page when delivered; do not invent an unavailable product state. |

The consolidation delivery must inventory every current export and record its destination or
retirement. A removed story's useful assertions need a named retained story or other existing
contract check. A smaller sidebar is not evidence that behavior coverage survived.

## Complete fixtures

Use a shared source of production-copied content to assemble the stage fixtures. Keep copied
definitions, displayed identities and artwork together with their provenance. The existing
`drafting.stories.fixture.ts` captures public catalogue and profile data; it is useful input, not
a complete saved game. Its content and relationships must be checked before reuse.

The full state must explain what the reviewer sees. A Playing story needs the same six players,
assigned factions, coherent pieces and inventories, and the correct private projection for the
viewer. Other stages have their own valid partial progression, such as factions not yet assigned
during drafting. Do not turn a two-player battle into a two-player game merely because the other
four players are not involved in that battle.

Loading, refusal and access stories supply the actual session, provisioning or permission state
that produces the page under review. Include the production-derived content that page displays,
but do not fabricate a completed game for a scenario whose point is that no game view is available.

The story runner remains isolated. Production copies provide authentic content, while deterministic
identifiers and mechanical setup let the story load repeatably. Story-specific changes create the
scenario without claiming it is a recording of an actual production game. A scripted socket seam
may deliver the projected state and record intents; it must not become a second gameplay engine.

## Delivery order

1. [Consolidate Play stories on realistic six-player product states](https://github.com/ndelangen/dunezone/issues/1295)
   after the active conversation and retained-log deliveries finish touching the same story file.
   Move the useful scenarios, replace placeholder content, verify real page renders and remove
   Demo/Hosted story duplication in that delivery. Capture the old and new sidebar and representative
   full pages, then run affected story and release checks.
2. [Retire Demo and Hosted routes after real-game verification replaces them](https://github.com/ndelangen/dunezone/issues/1296).
   The hosted-browser verifier still opens `/play/hosted` and `/play/demo`. Move those checks and
   other tool consumers to provisioned real games before removing the routes and their unused code.
   Preserve privacy, interaction, reconnect and revocation coverage. Keep useful native test
   fixtures and reusable renderers. Real-game access remains Administrator-only until the separate
   public-release decision changes it.

These tasks replace the temporary application paths; they do not authorize changes to stored
production games. The current load tooling and durable-transition refactor have separate active
claims. Recheck those claims before changing their consumers.

The consolidation's [per-story migration inventory](../../src/app/routes/_app/play/product.stories.fixture/migration.md)
records retained interactions and deliberate retirements. Its
[fixture provenance](../../src/app/routes/_app/play/product.stories.fixture/README.md) distinguishes
copied public content, locally rendered faces and staged game states.
