# GF9 authoring files

These files hold the composed GF9 content. The manuscripts and importer packages in the parent directory are historical evidence. The old manuscript build must not regenerate this correction.

The initial inventory is deliberately empty and marked `scaffold`. Both environment files are `unbound`. No production IDs, inferred owner or review passes are supplied. Preparation refuses this state. The content authors fill the inventory from saved normal exports and source-backed compositions, then set it to `ready`.

## Files and identities

Each manifest record has a semantic `key`, `kind`, explicit Asset `type`, `operation`, `scope` and a `file` relative to `authoring/`. Books use `books/core.json`, `books/ixians-tleilaxu.json`, `books/choam-richese.json` and `books/ecaz-moritani.json`. Each is the full `{settings, contents}` value. Factions and Assets use their full writable objects. An existing record is an `update`; additions and Custom-to-Spice conversions are explicit. Shared stock is `reference` only and has no replacement file.

Books retain their original GF9 dimensions. Both supported designs, Illustrated classic and Restrained expansion, pass the shared settings schema. Preparation and collection preserve the selected design.

`changes.rename` permits an intentional name change only when the captured viewer has the normal rename capability. The report tells the operator whether to enable the editor's default-off "Also rename" choice. `changes.assignGroup` lists the separate ordinary GF9 Group operation. Neither flag performs that action. `changes.relationships` documents separately reviewed membership/Ruleset operations. Raw JSON cannot change those relationships. After such an operation, capture the actual new state, review its counts and explicitly refresh the protected baseline before preparing consumers.

Every Page, Block, nested item, Faction member/troop and authored layer ID belongs in `identities.json`. Entries contain a semantic `key`, typed `path`, exact `value` and `kind`. Page entries include `layoutId`; Blocks name their Page's semantic key in `owner`; nested book items and layers name their Block. `retired` records retain old key/kind/value/owner, replacement keys and a reason. Surviving Pages keep their layout; new layouts and moves to another owner receive new IDs. `identities` prints actual owned paths without filling the registry or bypassing its later validation.

Typed cross-record references contain `@gf9/<key>`, with an initial `gf9-` removed from the target key. For example, `gf9-great-maker` uses `@gf9/great-maker`. Each appears at an explicit path in `reference-bindings.json` with `entityKey`, `path`, `targetKey` and `field`, either `id` or `slug`. Paths can include numeric array indices. Only reference fields defined by the shared writable schemas can bind. Prose, component UUIDs, local anchors and maintained board-definition names never undergo global replacement. Unknown, moved, duplicated or incorrectly typed references stop the affected operation.

`links.json` records current cross-book links and retired/split anchors. The first destination is the primary split destination. Internal Page/Block references must resolve in the composed book. Historical explicit Edition links require a declared Edition/anchor and a hashed saved proof file in `historical`; their saved text is never rewritten. Review must check actual reader and intermediate publication links too. File validation cannot prove a public reader response.

`artwork.json` records each maintained source/extract, hash, page, operation, dimensions, limitation and artwork key. Its used records must agree with `artwork/provenance.json`, whose bytes enter the authoring hash. All source and coverage records under `evidence/` also enter that hash. Keep raster bytes in the established maintained-media/R2 system and use normal `media:sync`. Book covers use currently registered stock presets and the existing cover controls. The shared schema validates the selected preset. Do not add new GF9 cover images, cover textures or a cover ingest profile. URL covers and manufactured stored-image metadata are refused for these books.

## Normal saved checkpoints

First save or deliberately discard every open editor draft. A file command cannot detect a hidden browser draft. Check the application and backend origins in the selected local runtime manifest or the deployed application's identity. Do not infer an environment from a document ID, because a snapshot can preserve IDs.

In the signed-in app open `/imports?ruleset=gf9&group=gf9`, then **Export a record**. Choose the record kind, address and Asset type when applicable, and use **Download JSON**. The saved file is exactly a `dunezone-package` v1 with `packageKey: export-<slug>` and one item whose `key` and `existing.slug` equal the saved slug. Rulebook export data includes `name`; collection strips only that explicit row field and retains full settings/Contents. The importer envelope is never sent to raw Load.

Alongside each export, capture a read-only observation of the same saved record through the normal authenticated app. `tooling/contracts.ts` defines `readbackSchema` and `checkpointSchema`. The readback records actual application/backend origins, GF9 Ruleset/Group IDs, signed-in viewer ID and capabilities, target ID/kind/type/slug/Group/owner, writable data, membership counts and Ruleset links. Rulebooks also need saved name/revision. The existing export hash is checked against that observed identity/data/relationship state. A reference-only stock item needs a current readback, but no writable export.

These are file evidence formats, not new app endpoints or authority tokens. The tool checks consistency and hashes; it cannot authenticate how an operator obtained a file. Never manufacture identities or populate a readback from assumptions. Use evidence from the actual signed-in runtime and retain the source response or browser proof. Keep credentials and account profile data outside the repository.

A checkpoint contains `openDrafts: saved-or-discarded`, capture time, actual origins and each record's relative readback/export paths, SHA-256 hashes and export time. New preparation, inspection and collection require checkpoints and per-record observations at most 30 minutes old. Refresh captures before starting a later operation. This age limit is an evidence guard, not a database lease or a concurrency lock.

Populate `environments/local.json` or `production.json` from those observations. A bound record contains actual ID, slug, kind/type and Group. Start without baseline hashes if needed, then run `inspect` to print the measured `savedHash` and `protectedHash`. Review those observations and copy their hashes to `baselineSavedHash` and `baselineProtectedHash`. Preparation refuses missing baselines. An explicitly new record may instead be `uncreated`; create through the normal UI, bind its real result, and capture its baseline before preparing its consumers.

## Local preparation and collection

From the repository root:

```sh
bun content/gf9/authoring.ts identities
bun content/gf9/authoring.ts validate --environment local
bun content/gf9/authoring.ts inspect --environment local --checkpoint review/<run>/checkpoint.json
bun content/gf9/authoring.ts prepare --environment local --checkpoint review/<run>/checkpoint.json --run <run> --initial-baseline
```

`--initial-baseline` initializes only missing synchronization records after their fresh saved hashes match the explicit verified environment baselines. It cannot overwrite an existing synchronization entry. Later preparation omits it. `--keys key,key` limits work; include the necessary dependency checkpoint observations. Unrelated healthy records can still prepare when another record or consumer is blocked.

Generated per-entity files and `report.json` go under `generated/local/<run>/`. Same inputs produce identical values and hashes. A run name cannot be reused for different inputs. Review the report, paste the per-entity value through the normal editor Load control, inspect it and use normal Save. Group assignment, membership corrections and conversion stay separate normal operations. Load itself does not Save or Publish.

After Save, inspect the saved result and obtain fresh unchanged Download JSON files and readbacks. Collect first writes a difference plan and performs no authored-file replacement:

```sh
bun content/gf9/authoring.ts collect --environment local --checkpoint review/<saved-run>/checkpoint.json --run <collect-run> --prepared generated/local/<prepare-run>/report.json
```

Collection reverses only declared bindings and compares the value after the same writable normalization used by the app, including Faction complexity. It preserves bold formatted text and component IDs. New IDs, layouts or changed reference paths need an explicit authored/sidecar reconciliation before collection; it refuses to silently invent their meaning. If both authored files and saved local data changed, the exact preparation report and intact payload hashes must identify that local authoring pass. Otherwise collect stops the affected record for reconciliation.

Review every changed path and the complete proposed JSON. Apply only the reviewed file plan by its printed hash:

```sh
bun content/gf9/authoring.ts collect --apply generated/local/<collect-run>/report.json --reviewed-hash <plan-hash>
```

This `--apply` writes authored JSON and the local synchronization file only. It never calls the importer or an application writer. It rechecks all captured input hashes and recomputes the plan first, using the recorded collection time for the capture freshness checks. An unchanged reviewed plan remains applicable after 30 minutes; changed inputs require a new plan and fresh captures. Each file replacement is atomic; a multi-file apply is not a database transaction. If the process stops partway through, retain the report and files, capture saved state again, then review and reconcile a fresh collection plan. Do not reset the runtime or rerun an old plan blindly.

Prepare again from the collected files and compare the saved value after normal normalization. A local saved change not in the last collected checkpoint blocks that entity and its consumers. Creating or converting a target requires updating its actual binding, not guessing a future ID or type.

## Production preparation and progress

Code and maintained bitmaps deploy before the final local content review. Refresh the preserved local app to that code, verify the content again, Save/export/collect, and commit the authored files. Independent rules, visual and workflow review evidence identifies the exact authoring hash/commit, local synchronization and typed-binding hashes, source/media identity and local code identity. All four complete local books require the user's approval before book preparation. `reviewSchema` defines the required manifest; its evidence strings point to real reports or durable proof, never invented passes.

```sh
bun content/gf9/authoring.ts prepare --environment production --checkpoint review/<run>/production.json --local-checkpoint review/<run>/local.json --review review/<run>/manifest.json --run <run>
```

Production preparation resolves production bindings and refuses local origins, unresolved keys, missing destinations, missing local collection, stale review, dirty authoring files and protected identity/owner/Group/count drift. This one-time content correction overwrites the reviewed scoped production writable values. A later content-only change does not trigger a production merge workflow. Captured `beforeHash` still records what will be replaced.

The output is raw editor JSON only. It cannot write, assign ownership, mint an identity, call importer apply, Save, Publish or deploy. Use the two controlled authenticated content batches. Publish and verify one approved book at a time, preserving older Editions. Verify actual intermediate links and newly current reader output before the next publication. The final review/run evidence must identify public results; prepared files alone cannot certify them.

Use `review/<run>/manifest.json` for approval identity and proof links. Use `runs/<run>.json` for observed Save/rename/Group/conversion/publication/verification events, target IDs, before/desired/after hashes, actual revision/Edition/artifact identities and any blockers. The [run record contract](../runs/README.md) lists their fields. The tool never marks these operations passed. Record only observed results and keep credentials out.

The file tests cover normalization, typed rebinding, deterministic output, reviewed collection, refusal paths and production review guards. The real authenticated local Load/Save/Download/collect round trip remains a required integration gate on the combined deployed-code local copy. The tests do not claim that gate or a content review has passed.
