# GF9 production content batches

Resolved for [Define the two authenticated GF9 production content batches](https://github.com/ndelangen/dunezone/issues/2365). This is a planning contract. No production records were changed to establish it.

Follow the [authoring decision](https://github.com/ndelangen/dunezone/issues/2363#issuecomment-6288792502), [component decision](https://github.com/ndelangen/dunezone/issues/2362#issuecomment-6292530247) and [acceptance contract](../acceptance/acceptance-contract.md). Those contracts own payload shapes, approved appearances and content review. This document owns production order, public behavior and recovery.

## The release order

1. Implement and deploy the required compatible code and bitmap/media additions through the normal PR workflow. Each PR requires separate Astra High code and architecture reviews of its exact final head, adjudication of other AI findings, required CI/audits, merge, deployment and focused live verification.
2. Update the persistent local Dune Zone copy to that deployed code and registered media. Preserve authored files, local database, authentication and publisher storage. Do not import another snapshot over authoring work.
3. Complete independent rules, visual and workflow checks of the entire saved local GF9 inventory. Fix defects and repeat affected checks. Any necessary further code/media correction goes through deployment and local refresh first.
4. Apply batch one, the corrected factions/assets/Ruleset logo, after its reviewed local content and dependencies pass. The user's accepted component treatments remain settled. A new product choice or changed accepted appearance needs review before that affected write.
5. Show all four complete saved local books in the web reader and record the user's approval against the reviewed authored commit, saved revisions and code/media identities. This approval is required before any production book content update, including draft Save. Batch one may complete while the user reviews the books.
6. Apply batch two, the four approved books, after batch one and all book dependencies pass. Publish and verify one book at a time.

The user explicitly selected normal immediate publication. Publish makes that book's new web Edition current immediately. Background previews and download files may briefly remain in preparation. Verify the new reader before publishing the next book. Do not build a candidate Edition, delayed activation control or all-books transaction.

PDF creation remains with the existing publishing system. No human PDF review, physical proof or separate PDF acceptance project is required. Observe normal publication results and investigate failures. Relevant publishing code changes still need their focused regression checks.

## Production targets and writable scope

Use the existing [GF9 Ruleset](https://dune.zone/rulesets/gf9) and [GF9 Group](https://dune.zone/groups/gf9). The production preparation report resolves semantic keys to actual current entity IDs, kinds/types and slugs. An old snapshot, matching ID string or remembered owner is insufficient evidence of a production target.

| Target | Permitted content change | Protected data and separate actions |
| --- | --- | --- |
| Existing twelve factions | Reviewed full writable faction data, approved names, rules, leader labels/portraits, component styling and Extras references | Preserve faction IDs, existing component/member UUIDs and ownership. Group assignment is a separate normal owner action. |
| Existing GF9 assets needing correction | Reviewed full writable data for the actual asset type, approved names, artwork/style/text and typed references | Preserve entity ID, owner, container membership/counts and unrelated relationships. Raw Load must not replace protected fields. |
| Six existing Discovery cards | The reviewed identity-preserving Custom-to-Spice conversion, followed by native linked-board data and normal publication | Deploy and prove the narrow authenticated conversion first. Retain IDs, counts, prior URL behavior and reverse dependencies. Do not duplicate the cards or use the unrelated administrative Treachery-to-Custom conversion. |
| New illustration-only type markers | Create the two approved generic Hiereg/Smuggler markers through normal authenticated creation | Record returned IDs and actual signed-in owner; assign GF9 Group through normal authorized controls. They are illustrations, not extra members of the random token pools. |
| GF9 Ruleset | Approved dark-square genuine GF9 logo through normal image selection/rehost and Save | Preserve ID, owner, name, about, Group, slots and book relationships. If the form sends name/about too, retain their current values. |
| Decks, bundles, Ruleset slots and Faction Extras | Only explicitly listed, reviewed reference/count corrections in the preparation report | Verify the full inventory. Do not clear and rebuild membership or change unrelated stock. Use normal relationship/count controls where these fields are outside Load. |
| Existing four books | Approved full settings and Contents, with normal cover selection/rehost where required | Preserve Rulebook IDs, Ruleset association, book identity, Edition history and unrelated metadata. Page/Block changes and link mappings follow the authoring decision. |

The factions are Atreides, Bene Gesserit, Emperor, Fremen, Spacing Guild, Harkonnen, Ixians, Tleilaxu, CHOAM, Richese, Ecaz and Moritani. The four book keys are `core`, `ixian-tleilaxu`, `choam-richese` and `ecaz-moritani`.

Audit every GF9 entity, including unchanged members. Write only corrections identified by the reviewed inventory. The preparation report must enumerate every intended creation, update, conversion, rename, Group assignment and relationship/count change before a batch begins. Each operation names its actual target, fields, normalized desired hash and dependency keys. An unresolved target or unlisted extra write blocks that operation. The exact production IDs and final write count are execution evidence, not invented values in this planning contract.

Assign every GF9-owned correction/addition to the existing GF9 Group using the normal authorized control. Record any required existing Group correction explicitly. Preserve unrelated/shared stock and the accepted existing `arrakis-official` board. Referencing shared stock does not authorize taking its ownership, Group or data.

## Authentication and preparation gates

Use the actual signed-in application's Load, Save, creation, conversion, Group and Publish flows. Load replaces only the editor draft. Agents may paste the validated prepared JSON into the raw text input. Save remains the authenticated write. Never substitute direct database writes, privileged CLI/connector mutations, fabricated identities or an administrative import.

Before writing, verify the session's identity and effective capabilities on the exact target. Editing content does not imply permission to rename or reassign Group. The separate `Also rename` choice remains off by default and is selected deliberately only for listed approved name corrections. A missing capability stops the affected action; ask for the appropriate normal owner/maintainer action rather than impersonating an owner.

Prepare from the reviewed versioned authoring files and explicit production bindings. Retain source/judgement coverage, local saved proof and code/media identity. For production book preparation and batch two, also retain the user's complete-book approval. Resolve references to real production entities and actual returned slugs. No localhost origins, unresolved local-only references, unknown field removal or uncollected local edits may survive preparation. Measure final payloads against the authoring limits and deployed writer/publisher bounds. No truncation.

Take normal authenticated before-exports/readbacks of scoped writable content and record protected identity, Group, memberships/counts and current Edition numbers. These support comparison and forward correction; they are not a database-restore mechanism. Keep credentials, session cookies and tokens out of committed files and run records.

Before each Save, confirm the editor is the intended production target and preview the loaded draft. After Save, reread/download the actual saved values and compare them with the desired normalized payload. Check protected fields and relationship counts. An optimistic UI, successful paste or Save notification alone does not pass this gate.

The agreed one-time overwrite policy applies to scoped editable content. Do not add a production merge/conflict platform. Normal authorization, schema validation and existing Rulebook revision checks still apply. Ownership, Group and relationship/count changes remain separate explicit actions.

## Batch one procedure

Build the dependency order from the prepared references. The usual progression is maintained media already deployed, leaf token/back targets, cards, containers and faction references, then the Ruleset logo. Existing entities retain identity. Create a required new reference target before saving a consumer, record its returned ID/slug, then regenerate affected payload bindings. Never invent an ID to make a dependency graph appear complete.

1. Verify all required deployed media and rendering support, including the registered shared grayscale texture and the authenticated conversion and Load controls. Prototype-only CSS/files do not count.
2. Create the two listed generic type markers. Save corrected token/back targets and other leaf assets. Record normal Group assignment separately.
3. Apply approved card corrections, including current Karama and the six native Discovery conversions. Retain meaningful bold text, complete fitted titles, both territory tint roles and ordinary Spice amount placement. These are content checks owned by the acceptance contract, not new design questions.
4. Apply only listed container membership/count corrections and actual returned reference bindings. Preserve main-deck versus Richese-cache Karama roles, six Discovery cards, Great Maker and four outcomes of each Discovery pool. Illustration markers do not enter those pools.
5. Save corrected factions and Extras once their targets exist. Preserve component UUIDs. Remove visible GF9 prefixes through the deliberately selected rename flow where required.
6. Save the Ruleset logo while preserving other fields. Complete listed GF9 Group assignments with the required normal capability.
7. Reread each saved target, check its actual publications and inspect public output. Recheck consumers after their last dependency change. A consumer's earlier successful render does not prove it includes a later correction.

Existing asset/faction saves can expose new data before replacement images finish. A prior completed image can remain public while its replacement prepares or fails. A new asset may lack its first image until publication succeeds. This batch is a sequence of normal saves, not an atomic catalogue switch.

Only mark a required face/sheet ready when its publication belongs to the desired saved source and renderer and its actual public bytes render correctly. Record publication identity and retrieved artifact hash where available. A version query string, old image returning HTTP 200, empty queue or healthy publisher process is insufficient. Containers that publish no image pass through their saved composition/membership and actual consumer output instead.

Batch one completes when all listed writes, relationships and required derived images pass, the public logo/factions/assets show the reviewed result, and preserved identities/counts/Group are verified. A failed dependency blocks its consumers. Independent preparation and diagnosis may continue, but do not enter batch two while batch one is incomplete.

## Batch two procedure

Entry requires completed batch one, ready dependencies, the full independent local acceptance results and recorded user approval of all four complete books. Apply no unreviewed editorial changes while copying them. A necessary change returns through local authoring, affected review and user review of changed book material with context.

Save all four approved production drafts through normal Load/Save and verify their settings and Contents. A saved draft does not itself replace the current reader Edition. Use the actual post-save revision for Publish. Normal cover handling must retain the accepted source quality and original formats. Do not bypass the required normal rehost profile with fabricated stored metadata.

Publish in this order:

1. Core rules.
2. Ixian and Tleilaxu expansion.
3. CHOAM and Richese expansion.
4. Ecaz and Moritani expansion.

Before each Publish, verify the saved draft still matches the approved settings/Contents and its dependencies pass. Preparation also checks links against the intermediate publication order. A new book must not require an unpublished replacement anchor in a later book for its links to work. Use existing stable semantic targets where available. If the actual composition makes that impossible, stop preparation and resolve the concrete link dependency before production rather than knowingly publishing broken links.

Use the existing confirmed Publish control. Record the verified Rulebook ID together with the returned Edition number, which identifies the immutable Edition, and the saved revision Publish consumed. The normal result does not promise an Edition row ID. Verify the default public reader selects that exact new Edition and that an explicit link to the same Edition agrees. Check every Page, ordered content, illustrations and current/direct anchor links against the approved local result. Only then publish the next book.

Publishing advances the current Edition immediately. The reader can render that selected Edition while its frozen HTML is preparing. It must not show an older ready Edition as a content fallback. The first-page preview and HTML/PDF artifacts have separate preparation states; observe and record them without adding human PDF sign-off. A brief pending state is permitted while the next verified book proceeds. A terminal failure or a missing/wrong public reader blocks further publication until investigated. Final batch completion requires each book's required preview and HTML/PDF outputs to be ready and retrieved at the correct identity. Preparing work remains incomplete even when its delay is understood.

Check background readiness against the exact resulting Edition. Stable artifact paths contain `/published/rulebooks/<rulebookId>/editions/<editionNumber>/rulebook.html` or `rulebook.pdf`. The latest HTML alias can temporarily serve an older ready Edition. There is no latest PDF alias. Neither an alias response nor an unrelated artifact proves the new Edition is ready. Readiness checks are operational checks of the existing publisher, not a request for the user to inspect a PDF.

Old explicit Edition links retain their saved text/settings and completed HTML/PDF artifacts. Old web Editions may show corrected live component images, as already accepted. An earlier completed book may therefore be current while later books still show their older Editions. This intermediate state is permitted by the chosen one-at-a-time publication order.

## Interruption, retries and recovery

Use `content/gf9/runs/<run>.json` as a durable execution checkpoint, separate from authoritative authored content. Record batch, authored commit, application/renderer/media identities, signed-in user ID without credentials, target key/ID/type, desired payload hash, before/after exports, attempt times/results, saved revision, returned Edition/publication identities, verification evidence, remaining work and failure reasons. Save checkpoints after each confirmed operation. Generated reports can live beside the run under the authoring contract's paths.

On restart, read the run and the actual target before doing anything. Do not replay a whole batch. If code/media has changed, determine which prior evidence is invalid and repeat those checks first. Keep the persistent local runtime available for forward corrections throughout the job.

| Event | Required action |
| --- | --- |
| Save response lost or session interrupted | Reauthenticate normally if needed, reread the actual target and compare normalized writable content. If it matches, record success and verify publication instead of resaving. If it differs, reapply only the listed reviewed payload after verifying target/capabilities. |
| Creation response lost | Reconcile the actual owner's newly created records using run evidence, exact content and recorded references before retrying. If identity remains ambiguous, stop that creation. Never create another marker merely because no response was received. |
| Book revision is stale | Reload, reapply the approved full settings/Contents and retry with the current revision, at most three deliberate attempts. Retain normal validation and authorization. A repeated stale result stops that book; no revision downgrade. |
| Publish response lost | Reread the current Edition and draft. If the current Edition matches the intended settings/Contents, record its actual identity and verify it. Otherwise use the still-approved saved draft and normal Publish flow. An unchanged result is not another Edition. Never republish to repair an image. |
| Existing Asset image is pending or failed | Separate saved-data verification from publication verification. Preserve any prior public image through existing behavior. Let pending work proceed. After diagnosing a terminal failure, normal Save of the same approved Asset data re-enqueues publication and refreshes dependants. Record and bound the attempt; no artificial content edit is needed. |
| Faction image is pending or failed | Let pending work use the existing publisher's retry policy. An unchanged normal Faction Save can retry the sheet, but unchanged token/leader/traitor/alliance/troop faces can be skipped by selective enqueue. Do not promise that Save retries them all. Diagnose the failed face and stop affected consumers if no normal recovery exists; do not toggle authored content to force a capture. |
| Current book first-page preview failed | Use the existing authenticated `Retry preview` action. It retries the current Edition's first-page image without a new Edition or draft change. Recheck that specific image. It does not retry Edition HTML/PDF work. |
| Edition HTML/PDF failed | Record the exact Edition, artifact and failure. Diagnose the existing publisher. There is no general authenticated artifact retry promised by this contract. Do not call internal work mutations, override queues, fake success or create duplicate Editions. A necessary repair to supported publishing behavior goes through reviewed code delivery, then affected verification. |
| A content defect is discovered after a write | Stop affected consumers and later book publications. Correct the versioned local content, independently re-review it and apply the scoped normal forward correction. Show changed book content with context if user approval is affected. |
| A bad Edition has become current | Preserve immutable history. Prepare and approve a corrected draft and publish the next normal Edition. Earlier explicit Edition links remain available. Do not move the current pointer backward or edit saved Edition rows. |
| Batch one completed but batch two cannot finish | Keep the accepted corrected factions/assets/logo and any individually verified books already published. Leave remaining books on their prior current Editions. Record the exact partial state and fix forward. Do not undo good work or restore the database. |
| Wrong target, missing capability, unknown reference or protected-field change | Stop the affected operation immediately, preserve evidence and reconcile the target/scope before continuing. No administrative bypass, ownership override, deletion or unrelated repair is authorized. |

Bound transport waits and record attempts. Do not repeatedly click Save, Publish or Retry while a job is already pending. A terminal failure needs diagnosis, not a blind retry loop. An unrelated global publishing queue item does not block GF9 completion; the required GF9 targets and their consumers do.

## Completion evidence

Batch one has a separate completion record before batch two starts. Batch two has a per-book Save, Publish and public-reader verification record, followed by background publication results. No record is complete merely because a local preview or old publication looks correct.

Final public checks use ordinary unauthenticated pages as well as the authorized readbacks. Verify the GF9 Ruleset logo, all corrected faction/card/token faces and backs, relevant container counts, Group assignments and all four default book readers with their actual new Edition identities. Check representative former URLs where rename/conversion changed routing, every authored internal link and the explicit historical Edition behavior required by the acceptance contract. Record actual saved settings, renderer/media identity and output evidence.

Report completed and incomplete operations separately. Keep [GF9 judgements](https://github.com/ndelangen/dunezone/issues/2352) current for content rulings and [DuneZone GF9 missing features](https://github.com/ndelangen/dunezone/issues/2353) current for discovered supporting defects. A failure that needs a new product choice returns to the map as a decision; routine implementation bugs receive fixes within the accepted contract.

## Source checks behind this decision

Verified against fresh `real-origin/main` commit `9dbab957db90dca784da754635f7643b9d7fdd4f` when resolving this ticket. Recheck after the planned supporting changes ship.

- `convex/rulebooks.ts`, `publish` advances the current Edition in the same mutation that queues background work. `retryFirstPagePreview` retries only the current first-page image. Current contents-only unchanged detection must receive the settings-aware correction required by the authoring contract before release.
- `convex/rulebooks.editions.test.ts` proves immediate current Edition advancement and initially preparing artifacts. `convex/rulebooks.publication.test.ts` covers the separate first-page retry.
- `src/app/routes/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/publishedReader.ts` keeps rendering/fallback tied to the selected Edition.
- `convex/rulebookEditionArtifactWork.ts` resolves an explicit Edition only when ready, while an unspecified Edition selects the newest ready artifact. `src/shared/rulebooks/editionArtifacts.ts` defines permanent paths and the latest HTML alias.
- `convex/assets.ts` and `convex/factions.ts` use normal authenticated updates, preserve identity and queue relevant publications. `convex/lib/publication.ts` coalesces pending work and replaces failed jobs, while selective faction enqueues can skip unchanged component faces. Group and container membership/count actions remain separate. The planned narrow Discovery conversion and raw Load extensions are required work, not existing behavior established by these checks.

The user chose one-book-at-a-time normal publication after hearing about immediate current-Edition visibility and delayed background files. Delayed candidate activation and an all-at-once release were rejected as unnecessary for this correction. Database restoration, historical Worker rollback, revision downgrades and queue overrides remain outside the permitted recovery path.
