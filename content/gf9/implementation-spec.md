# GF9 correction implementation specification

Approved through live user review on 20 October 2026 for [Approve the agent-ready GF9 implementation specification](https://github.com/ndelangen/dunezone/issues/2366), the final decision in [GF9 correction: local review and two production content batches](https://github.com/ndelangen/dunezone/issues/2357). The user selected "Approve the implementation specification" against the reviewed handoff at commit `b27d6dc01052d8ac2297f0475edca1288627777d`. This status update preserves that contract. Implementation and final content acceptance remain to be completed; the planning map performs no production correction.

## What the user will get

The existing GF9 Ruleset will have its genuine publisher logo, corrected faction and component artwork, full visible names and four complete teaching books at the original GF9 formats. The books will cover the Basic and Advanced game, all twelve factions and the three expansions. FAQ entries and repeated Sources sections stay out of them. Research, source coverage and contradictions remain available separately.

Required code and bitmap/media changes ship to production first. Agents then update the persistent local Dune Zone copy to that deployed code, retain its authored data and verify all content there. The user sees all four complete books in the local web reader before any production book update. Accepted covers and component designs remain settled.

Two normal authenticated content batches follow. Correct factions/assets/logo first; then save and publish the approved books, checking each new public reader before publishing the next. Background files can briefly prepare while the next verified book proceeds. Completion still requires correct final publications. There is no additional human PDF review.

The coordinator owns implementation, independent reviews, fixes, CI, merge, deployment, local verification, user book presentation and scoped production delivery. Routine defects do not return to the user as implementation questions. New product choices and changes to accepted designs do.

## Authority and reading order

This document assigns work and defines handoff order. Each linked decision owns its detailed contract. Read the applicable decision before editing its code or data. Later explicit user instructions and later resolutions supersede older proposals. If two current contracts still conflict, stop the affected work and record the concrete conflict rather than choosing silently.

| Authority | What it owns |
| --- | --- |
| [Persistent local runtime](https://github.com/ndelangen/dunezone/issues/2367#issuecomment-6287147758) and its [accepted proposal](https://github.com/ndelangen/dunezone/issues/2367#issuecomment-6286590593) | Snapshot bootstrap, named persistent lifecycle, local auth/storage/publisher isolation, encoding correction and runtime acceptance. The proposal's historical Draft label predates acceptance. |
| [Authoring contract](https://github.com/ndelangen/dunezone/issues/2363#issuecomment-6288792502) | Exact file paths, typed bindings, prepare/collect, raw Load shapes and guards, opt-in rename, settings/Contents, Page ownership, links, cover profile and one-time overwrite. |
| [Teaching composition](https://github.com/ndelangen/dunezone/issues/2361#issuecomment-6288339539) | Revised C, four original covers, original formats, adjacent illustrations, quieter headings and the four-page Shipment and Movement progression. |
| [Accepted components](component-prototype/accepted-component-spec.md) and its [resolution](https://github.com/ndelangen/dunezone/issues/2362#issuecomment-6292530247) | Exact logo/portrait/token/card treatments, persisted controls, conversion and approved component data. |
| [Acceptance contract](acceptance/acceptance-contract.md) and its [resolution](https://github.com/ndelangen/dunezone/issues/2364#issuecomment-6293165287) | Complete source/rule/visual/workflow evidence, independent reviewer roles, code/media first and full-book user review. This later decision supersedes older demands for human PDF or physical proof. |
| [Production batches](release/production-batches.md) and its [resolution](https://github.com/ndelangen/dunezone/issues/2365#issuecomment-6293525914) | Exact writable scope, capabilities, order, immediate activation, run checkpoints, interruption and forward recovery. It supersedes earlier candidate-before-current proposals. |
| [Missing-features dispositions](missing-features-dispositions.md) | Every historical feature/workaround concern and whether implementation must correct, support, preserve or exclude it. |

Source inspection for this handoff used freshly fetched `real-origin/main` at `9dbab957db90dca784da754635f7643b9d7fdd4f`, included in this planning branch. Supporting changes are not present merely because a prototype shows them. Every implementation worktree must run `bun run worktree:setup` and resolve its actual current base before edits. Use the repository's `norbert/` branch prefix.

Keep this planning checkout as the reference while implementation branches start from current main. Read the pinned decision artifacts here or through their commit links. Bring only the required reviewed application changes, authored content and registered media into delivery PRs. Do not merge the exploratory prototype history or copy its runtime/CSS overrides into the application.

## Starting inventory, sources and destinations

Keep the existing [GF9 Ruleset](https://dune.zone/rulesets/gf9) and [GF9 Group](https://dune.zone/groups/gf9). Verify their actual production IDs and the signed-in account's capabilities before production preparation. Local snapshot IDs can equal production IDs; origin and verified binding establish the environment.

The historical `content/gf9/package.json` has 251 items, comprising 235 assets, twelve factions and four books. It supplies an inventory starting point and existing semantic keys. It is not the correction input or a completeness proof. Inventory the actual saved catalogue, Ruleset slots, Group associations, containers and Extras too. Record discrepancies explicitly. Audit the entire GF9 inventory; apply only enumerated corrections. No arbitrary final asset or Page count is prescribed.

The twelve existing faction keys are `gf9-atreides`, `gf9-harkonnen`, `gf9-emperor`, `gf9-spacing-guild`, `gf9-fremen`, `gf9-bene-gesserit`, `gf9-ixians`, `gf9-tleilaxu`, `gf9-richese`, `gf9-choam`, `gf9-ecaz` and `gf9-moritani`. Preserve entity IDs and surviving member/troop UUIDs. Full restored leader labels use the existing mappings in [leader-labels.json](leader-labels.json). Internal keys retain their GF9 namespace; visible faction/asset text loses the literal prefix.

| Existing book key | Authoring file key | Required coverage |
| --- | --- | --- |
| `core-rules` | `core` | Setup, components, board reading, information, nine phases, alliances, Basic/Advanced distinctions, six base factions, battle/cards, collection/victory and supported optional arrangements. Shipment and Movement includes the full accepted strategic visual sequence. |
| `ixian-tleilaxu-rules` | `ixian-tleilaxu` | Ixians and Tleilaxu, Face Dancers, revival and alliance/Advanced powers, Hidden Mobile Stronghold, Tech Tokens and expansion cards/interaction rules. |
| `choam-richese-rules` | `choam-richese` | CHOAM and Richese, cache/auctions/No-Field, Charity/Inflation, alliance/Advanced powers, Leader Skills, Advanced Stronghold Cards and replacement-card interactions. |
| `ecaz-moritani-rules` | `ecaz-moritani` | Ecaz and Moritani, Ambassadors/Terror, co-occupation, Vidal, alliance/Advanced powers, Homeworlds, Nexus, Discovery and new-card/timing interactions. |

This is a coverage allocation, not a fixed chapter or Page template. Preserve every required clause and make the reading order teach the game. Existing Page/Block layouts determine composition; coordinates are for pieces/routes inside game illustrations only.

Read the retained source index in [the GF9 README](README.md), [Create GF9 ruleset](https://github.com/ndelangen/dunezone/issues/2216), [GF9 FAQ collection](https://github.com/ndelangen/dunezone/issues/2284) and [GF9 judgements](https://github.com/ndelangen/dunezone/issues/2352). Local supplied PDFs and source text are in `/Users/me/Projects/Dune/gf9-delivery/sources/`, with hashes in its manifest and the repository evidence. This correction reuses the already checked FAQ resources; do not repeat external verification without new contradictory evidence. FAQ answers can inform recorded rulings and normal procedural prose, never FAQ application records or Q&A sections.

Use applicable official rules/cards, explicit replacements and corrections, specific expansion procedures and recorded designer explanations in context. Community compilations and Dreamrules supply comparison/teaching ideas, not silent house rules. Independently verify source precedence and every adopted judgement against the actual new content. Preserve source-version caveats. Update the existing judgement issue and sidecars as contradictions are resolved.

The accepted teaching prototype is [commit e8b8d09fa](https://github.com/ndelangen/dunezone/tree/e8b8d09fa/content/gf9/prototype). It may need to be read from that commit, not the current prototype directory. Current component data and proof are under `content/gf9/component-prototype/`; the accepted specification names the controlling data/provenance files. Obtain official component reference material already collected under `/Users/me/Projects/Dune/dune-assets/` and the source manifests. Do not replace native map composition with a scanned map.

Preserve historical manuscripts, packages, source records and old audit results as historical evidence. Add explicit superseded notices to their entry points. Retire `content:gf9:build` as the correction build path so it cannot regenerate A4, old covers, single-column books, shortened names or Sources sections into the corrected files. The existing package importer remains available for its established use; this correction does not expand it or use its apply/publish flow.

## Implementation ownership and dependencies

At dispatch, the coordinator records one named agent and branch for every package. The role names below are ownership requirements, not claims that agents have already implemented them. An agent may own several sequential packages. Respect available concurrency and dependencies; an agent count is not a quality target.

| Package and owner role | Work and principal paths | Entry dependencies and exit evidence |
| --- | --- | --- |
| P1, runtime owner | Extend `scripts/app-dev.ts`, existing local instance/snapshot/provision/supervision helpers and local Worker configuration. Persistent lifecycle, import-before-first-schema bootstrap, local reviewer access, publisher/proxy/ingest wiring and smallest measured local Images encoding correction. | Start from the accepted runtime proposal. Exit with real local Save/ingest/publication, stop/resume/isolation proof and documented operator commands. No hosted fallback or raw production data. |
| P2, Load owner | Shared guarded raw parser and draft adapters; existing `src/app/widgets/authoring/LoadExisting.tsx`, toolbar integration and each editor's load source. Inline JSON editing, explicit Load, cancel/reset, late-validation protection and opt-in rename. | Agree writable contracts with P3/P5/P6 first. Can develop using compatible old shapes, but final round trip covers all new fields. Exit with normal authenticated editor journeys and capability/no-write-before-Save evidence. |
| P3, Rulebook owner | `src/shared/rulebooks/settings.ts`, Contents/render schemas/projection, `convex/rulebooks.ts`, `src/app/db/rulebooks.ts`, editor state/route and `src/game/rulebook/RulebookBlockRenderer.tsx`. Pair settings/Contents, original sizes and existing Card entry side/flow controls. | Freeze shared fields before P2/P7 final adapters. Exit with settings-only Save/Publish, older-caller compatibility, Page ownership/links and changed-layout renderer/export checks. |
| P4, title owner | One measured loaded-font fitter under `src/game/assets/utils`, HTML/SVG adapters, CardHead, direct Spice/Traitor/Alliance heads, CardBack and capture settlement. | Use the [complete title contract](component-prototype/shared-card-title-contract.md). Coordinate Spice edits with P5. Exit with every title path, subtitle/icon clearance, font settlement and ordinary non-GF9 regressions. |
| P5, component owner | Token styling/shadow schema/editor/projections and `CustomToken`; native Spice map/paper treatment and optional fixed type-token slot; text-only Treachery; narrow BG artwork clipping fix. Main paths include `src/shared/assets/schema.ts`, token/card editors, `src/game/assets/card/Spice.tsx`, `SpiceBoardMap.tsx`, `src/game/assets/treachery/Treachery.tsx` and faction sheet CSS. | Implement the accepted component data, not prototype hiding CSS. Freeze destination Spice fields/references for P6. Exit with backward-compatible defaults, actual saved preview/publication, all six native maps, intact bold instructions and component regressions. |
| P6, conversion owner | Narrow authenticated Custom-to-Spice operation, normal capability/conversion UI and reverse/publication dependency work. `convex/assets.ts`, `src/app/db/assets.ts` and asset routes. | Depends on P5's validated Spice contract and verified current address/history behavior. Exit with identity/count/Group/URL/ref preservation, denied capabilities/collisions, six real local conversions and correct destination publication. |
| P7, authoring-tool owner | Focused file-only prepare/collect operations under GF9 tooling; canonical inventory, identity/reference/link/artwork/synchronization contracts; command entry points and reports. | Depends on final writable shapes and normal single-record exports. Exit with deterministic per-entity payloads, reversible normalized collection, drift/ref/budget refusals and real local Load/Save/export round trips. No application-write CLI. |
| P8, media owner | Approved cover source files and source URLs; wider Malina/Ilban crops; genuine logo tile; exact shared grayscale texture; maintained catalogue registration and generated variants. Dedicated cover ingest support spans `src/shared/user-images/contract.ts`, `workers/publisher/user-images.ts`, cover validators and normal capability callbacks. | Can run alongside P1-P5 with declared contracts. Exit with exact approved hashes, normal registration/ingest, compatible unrelated profiles and actual authenticated cover quality proof. |
| P9, content owners | One author per book; one owner for shared faction/asset data and cross-book consistency. Author complete versioned data, source coverage and judgements; preserve identities, quantities and accepted visuals. | Source mapping and composition can begin early. Final saved content and acceptance wait for deployed P1-P8 support and refreshed persistent local rendering. No production write during authoring. |
| P10, independent review and release owners | Independent rules, visual and workflow reviewers plus coordinator. Full inventory matrix, user book presentation, two authenticated production batches and actual public checks. | Depends on P9 and all inherited gates. Reviewers do not independently pass their own authored work. Exit only with the acceptance and batch contracts satisfied. |

The local runtime and cover support may be split across PRs, but their proof must meet at the real authenticated Save/rehost/capture boundary. Media files alone cannot satisfy that gate. Conversion cannot proceed using a half-integrated Spice contract.

### Shared-file ownership

The coordinator keeps a live file-ownership table in the work log before parallel edits. The following integrations are serialized, with one writer at a time:

- Shared Asset schemas, `convex/assets.ts`, `src/app/db/assets.ts` and asset route conversion/capability wiring. P2/P5/P6 submit agreed changes to the assigned integration owner rather than editing concurrently.
- Rulebook Contents/settings/render contracts, `convex/rulebooks.ts`, its db doorway and the large Rulebook editor route. The Rulebook owner integrates P2/P3/P7 changes in order.
- `LoadExisting.tsx` and the authoring toolbar belong to the Load owner. Type-specific adapters stay beside their callers and use the shared parser contract.
- Spice renderer/CSS and card-head integration are serialized between title and component owners. Shared capture readiness and `PublisherCapture.tsx` have one integration owner.
- Generated asset IDs, media locks, renderer manifests, revision registrations, package scripts and final schema/codegen outputs are integrated by the coordinator with normal generators. Never hand-edit generated results to resolve a collision.
- Each authored book has one writer. Shared `manifest.json`, identities, bindings, links and cross-book coverage have one content coordinator. Authors propose updates to those shared files.

Assign a boundary before dispatch, not after conflicts appear. Separate branches/worktrees where appropriate, each based on a freshly fetched intended base. Integrate small compatible packages and retest affected contracts after integration. Do not merge the exploratory prototype as application code.

## Required contracts implementing agents must preserve

### Persistent local app

Implement the accepted launcher interface through the existing launcher, preserving its disposable default when persistence is absent:

```sh
bun run app:dev --local --data=snapshot --persist-dir=/Users/me/Projects/Dune/gf9-review
```

This is a required future command, not a command proven available in the inspected source. First use validates and imports the trusted anonymised published-only snapshot before initial schema allocation, then performs post-deploy draft/reviewer provisioning and rebuild/migration checks. Resume locks and reopens the same manifest, origins, resources, DB/auth, job state and local object stores. It does not seed, reimport, rotate identity or delete volumes. Ctrl+C stops only owned services. Explicit `--reset` is a separate destructive local action that identifies its resources, refuses an active lock and preserves authored files/evidence outside the state directory.

Use built-in local Browser and persistent R2 plus the existing publisher, capture, HTML/PDF, fonts, leases and image-ingest protocol. Keep write-capable calls and bindings local; reject production/hosted sentinels and omitted local configuration. Public source-image acquisition can be explicit read-only HTTPS. Missing local artifacts fail visibly instead of falling back to production or SPA HTML.

Correct the measured local Images mismatch without relaxing progressive-JPEG, quality or fit assertions. Prefer a pinned correction to the actual Wrangler-resolved simulator. Do not replace the publisher to fix a codec. Prove two environments are isolated, a second launcher cannot claim the same state, and interrupted jobs resume under the existing lifecycle. Normal code refresh retains the environment; future migrations run without resetting authored data.

### Raw JSON and file tooling

Use the exact canonical directory structure and operation contracts in the authoring resolution. The authoritative books are full `{settings, contents}` values under `authoring/books/`; factions and assets are full writable objects under their corresponding paths. Source/manuscript evidence is not a second editable publication source.

Asset Load accepts its exact type's writable `data`; Faction Load accepts full `FactionWriteSchema`; Rulebook Load accepts strict `{settings, contents}`. Reject row metadata, ownership, Group, publication/job state, importer receipts, membership fields and unknown fields with paths. Preserve authored component/Page/Block IDs according to their ownership rules. Raw same-entity Load must not reuse catalogue-copy UUID renewal. Existing copy Load keeps its behavior.

Use 512 KiB UTF-8, depth 64 and 50,000 structural nodes before expensive validation. Preserve existing per-type limits and the 100-Page book ceiling. Validate typed references and destination compatibility. Keep pasted text on error. Load changes only the draft, marks it dirty and does not move Reset's saved baseline. Cancel changes nothing. Route/account/source/text changes, cancellation and Save invalidate stale asynchronous results. No ingest capability or publication is created until normal Save.

Show `Also rename` for differing existing Asset/Faction names, off by default, gated by real capability and checked again at Save. Book identity/name/slug and container membership remain outside raw data replacement. A new create uses the supplied name normally. Separate relationship/Group actions stay explicit.

Implement file-only `prepare --environment local`, `collect` and `prepare --environment production` as specified. Document the final runnable command entry points when implemented; these operation names do not claim a CLI exists today. Obtain fresh normal authenticated exports for synchronization checkpoints. Uncollected local saved edits stop affected preparation. Save or deliberately discard open editor drafts before a synchronized handoff. Collect unwraps existing single-record exports, reverses only known typed bindings and presents differences. Unknown references fail. It never calls importer apply or writes application records.

### Rulebooks and artwork

Add `gf9-core` at 254 by 254 mm and `gf9-expansion` at 132.08 by 254 mm. Keep other formats unchanged. Settings and Contents participate together in dirty state, revision Save, unchanged comparison and Publish. Omitted settings from older clients preserve current settings. Keep existing contents hashes meaningful and use the authoring contract's compatible pair comparison without historical backfill.

A surviving Page retains its layout. A layout conversion creates a replacement Page ID. Moving a Block to a different Page creates a new Block ID; moving between compatible regions of the same Page preserves it. Record retired IDs and anchor split/merge mappings. Revalidate current/direct links and historical explicit Edition links. Do not promise every old text-selection locator survives a wholesale rewrite.

Extend existing Card entry with optional `imageSide` left/right and `textFlow` beside/wrap. Defaults remain left/beside. Carry through schema, editor, draft, saved data, Edition, projection, renderer and export/collect. In wrap mode prose returns to full width below the image. Keep aspect/accessibility/unavailable-source behavior. Existing Text names, Illustrated inventory and paired rows supply the remaining treatments. No duplicate illustrated-rule Block or paragraph coordinates.

Use all four accepted full original covers, no new overlay or crop. Store the accepted 3000 by 3000 core and 1560 by 3000 expansion source renders with source hashes/provenance and commit-pinned HTTPS URLs. Normal authenticated Save/rehost uses the dedicated `rulebook_cover` capability profile: maximum edge 3000, scale down only, quality 90 progressive JPEG. Update callback/stored-cover dimension checks compatibly. Profile selection belongs to the minted capability; arbitrary JSON cannot select it. Preserve source-byte/redirect/URL security and unrelated ingest profiles.

Both local and production ingest the same approved source bytes into their own stores. Collect local stored covers back to authored source references before preparing production. Never fabricate stored image metadata or retain localhost image URLs. The real authenticated rehost/capture proof blocks content approval if it cannot preserve the accepted appearance. Source limits remain documented; upscaling does not add detail.

Register maintained portraits/texture/extracts through the ordinary media pipeline instead of inventing rehost behavior for maintained references. The shared grayscale texture's accepted bytes are `component-prototype/public/token-art/hiereg-background-grayscale.png`, SHA-256 `17418d80b07639ef6c52abfc087ff4777e2a0145eec81413672e9a71614f95c6`. Do not regenerate it, add vectors, or upload the earlier coloured source. Preserve original sources and transformations in artwork provenance.

### Components and shared rendering

Use the exact accepted-component specification and data manifests. The following are the required implementation changes, not invitations to redesign them:

- One measured loaded-font title-fitting responsibility across all card fronts and backs, with HTML/SVG adapters, complete one-line text, icon clearance and fitting settled before existing capture readiness. Preserve typography and baseline; cover Traitor owner subtitles in their own region. No minimum-size clipping escape, abbreviation or per-asset fix.
- Optional persisted token symbol fill/stroke/strokeWidth and symbol shadow. Existing data retains current defaults. Approved hidden backs/type markers use the exact shared texture, existing Fremen/Guild vectors at scale 2, no curved labels, no extra edge ring and shadow off. Revealed outcomes retain one central existing vector and the accepted radial treatments. Unseen faces require their own source-backed selection/QA.
- Backward-compatible text-only Treachery for current Karama, retaining the two main-deck copies and separate Richese-cache member. Use the accepted exact replacement transcription, body typography and proper badges. Karama remains Treachery.
- Native Discovery Spice composition from the existing linked board, whole-territory tints and front token placements. Save the accepted named map/paper look, keeping map/tints/paper/placement aligned while filtering board/paper only. Standard amount stays bottom-right; one validated optional type-token reference has the fixed above-amount slot. Full instructions preserve meaningful bold. No author-entered slot coordinates or general filter editor.
- Narrow normal authenticated Custom-to-Spice conversion for the six existing records. Validate source/destination and permissions, preserve entity/owner/Group/counts, handle type-sensitive former addresses and slug collisions, replace reverse dependencies, supersede pending old-type work and publish/refresh dependants. Retained ID alone is insufficient. Keep it separate from Load and unrelated administrative conversion functions.
- Correct only the actual BG sheet artwork-container clipping so `to:` stays visible. Restore the accepted names/portraits/backgrounds/clauses through data. CHOAM has an intentionally empty logo and red-over-black background; Richese remains uniform grey. No logo exception.

Keep standard Spice behavior and ordinary non-GF9 consumers correct. Do not add a production badge-offset patch based on the prototype's border-box error. Existing Custom Card text positioning and shared board geometry/tints already work.

## Delivery checklist

The coordinator records an owner, evidence and outcome for each step. A checklist tick cannot substitute for the linked acceptance matrix.

1. Read applicable contracts, fetch/setup the actual worktree base, install the frozen dependency graph and assign package/shared-file ownership. Read Convex guidelines before any Convex edit, the relevant UI standards before editor work and publishing/media instructions before their tooling.
2. Agree compatible schema fields and callback/mutation shapes. Implement P1-P8 in bounded PRs. Use shared schema-derived types, focused public seams and a few real journeys. Preserve older client compatibility during deployment; do not delete an old live query in the same release that moves callers.
3. Exercise the real persistent local app for engineering proof, including raw Load/Save/export, cover ingest, conversion, title settlement, registered artwork and ordinary shared-renderer consumers. Measure final authoring inputs as they become available. A prototype is insufficient.
4. Every implementation PR receives two separate Astra High reviews, one code and one architecture, at its exact final head. Assess incoming AI reviews, fix valid findings and repeat affected review after changes. Complete required CI/audits and resolve threads. Include honest permanent before/after proof for visible changes. Merge using the permitted normal workflow, deploy and verify actual application/renderer Git identities and public behavior. Do not request another code approval after the user's established product authorization when these gates pass.
5. After all required compatible code/media is on production, update the persistent local copy to it. Preserve its DB/auth/storage and authoring files. Record the deployed/local renderer and media identities. Any further required support fix goes through release, local refresh and affected recheck first.
6. Finish complete P9 content. Use source-to-content and content-to-source coverage, full inventory, legal worked examples, faction/card/book agreement, original geometry and complete rendered text. Existing evidence carries forward only on exact qualifying identity/hash matches. Record and resolve contradictions in the existing ledger.
7. Independent reviewers pass every saved local Page and unique component front/back, rules and workflows under the acceptance contract. Fix findings, collect local edits and rebuild/round-trip. Verify payload budgets, owner/Group/ref/count preservation and final output identities. Required clipping is a GF9 content failure; do not alter the application's general valid non-blocking clipping model.
8. Present all four complete local web books with navigable links, full page access, reviewed commit/revisions and a short summary. No known blocking defect goes to the user. Do not ask for redesign approval of unchanged accepted covers/components. Record the user's book approval. Later changes receive affected independent review and changed-material user review with context.
9. Follow the [production-batch checklist](release/production-batches.md). Batch one may finish during book review. Before each operation, verify target/capability and explicit scope. Production preparation contains per-entity payload hashes and verified typed bindings. Use only normal authenticated flows. Before any production book Save, all four complete books require approval. Save all approved drafts, publish/verify each in order and track background completion.
10. Verify actual public output and historical-link behavior. Finish every required publication or report incomplete work honestly. Retain durable checkpoint/evidence records for handoff and resume. Keep judgements/missing-features issues current; do not close delivery merely because code or import succeeded.

Use existing repository commands appropriate to each changed area. At the inspected baseline, `bun run typecheck`, `bun run check`, `bun run test -- <focused paths>`, `bun run publisher:test -- <focused paths>` and relevant existing browser/Storybook/e2e scripts are the entry points. Read current script arguments before execution. Runtime and publishing changes use their existing isolation/capture/font/manifest checks where affected. Media uses normal sync/generation/gates. Run required full CI. Do not write tests per asset that mirror values in its input, source-text tests of implementation, or a general PDF-system requalification.

## Evidence, progress and recovery

Use `authoring/manifest.json`, identities/bindings/links/artwork and evidence sidecars as the content contract. `review/<run>/manifest.json` identifies exact local saved revisions, sources, authoring commit, code/media identities, reviewer dispositions and durable proof. `runs/<run>.json` records production target/desired/before/after/publication identities and completed operations. Credentials remain outside these files.

The coordinator maintains a durable work log with package owners/branches/PRs, exact reviewed heads, deployment identities, active local runtime command/state path, content authoring commit, open sessions, findings, completed gates and next work. Update it at handoffs and after meaningful state changes. A durable file plus run manifest supports another session resuming the job; a chat summary alone is insufficient. Keep the local environment until delivery completes or the user explicitly requests disposal.

Interrupted writes use actual readback before retry. Preserve good completed work and stop failed dependencies/consumers. The agreed one-time overwrite applies only to scoped editable content. Normal auth, schemas and book revisions remain; stale book reload/reapply is bounded to three deliberate attempts. No production merge platform, database restore, ownership override, revision downgrade, queue reset or historical Worker rollback.

Normal unchanged Asset Save can re-enqueue publication, but selective Faction Save does not retry every unchanged face. Rulebook Retry preview only retries the current first-page image. Current terminal Edition HTML/PDF failures have no general authenticated reset promised by this specification. Diagnose, preserve completed work and stop affected publication if no supported recovery exists. Do not toggle content or create duplicate Editions to restart jobs. A genuine content correction produces a reviewed new normal Edition.

## Limits and decisions that remain with implementation

Final Page count, source-backed artwork for unseen outcome faces, current production IDs/slugs, exact write count and actual account capabilities are measured/verified implementation outputs. They do not permit inventing rules, identities or designs. Source resolution and ordinary layout choices within the accepted treatment belong to agents with independent checks.

The dedicated authenticated cover profile, final largest-payload bound, integrated persistent runtime and every saved/published output must still be proved. If a measured limit cannot support approved content or the accepted appearance cannot be preserved, record the actual failure and ask only for the concrete new product decision it exposes. Do not silently shrink, truncate or weaken quality checks.

Excluded work remains excluded: FAQ import, paragraph positioning, duplicate illustrated-rule Blocks, new vectors, general token layers, sector-only tints, extra board labels/tracks, a general filter editor, whole-Ruleset dependency export, unrelated stock rewrites, candidate activation and all-at-once catalogue release. General overflow preflight and broader terminal-artifact recovery are separate follow-ups unless a concrete failure makes a supported repair necessary within delivery.

The user's live approval completes the specification decision and planning destination. It does not claim the implementation or complete books already pass. All code reviews, full-book user review and scoped authenticated production gates above remain in force.
