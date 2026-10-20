# Isolated local GF9 review runtime

Research for [Establish the isolated local GF9 review runtime](https://github.com/ndelangen/dunezone/issues/2358), under [GF9 correction: local review and two production content batches](https://github.com/ndelangen/dunezone/issues/2357).

Inspected on 20 October 2026 at source commit `77c26fcfa1a5ff61ae36b087fb55150f4da99497`. This report records current capabilities and recommends a contract for a future implementation. It does not claim that the complete environment exists.

## Finding

Use the existing disposable local Convex launcher as the database and sign-in foundation. Build a narrowly scoped GF9 baseline on that launch, then add isolated publication execution, image ingest and public delivery before calling it a working review copy.

The current local launcher is insufficient for the requested experience. It starts Convex, Vite, test accounts and a backend watcher. It starts no publisher, Browser binding, Images binding or object store. Vite does not serve `/published/`, so saving editable records and rendering static PDFs elsewhere does not prove that the local application can publish and read its own output. The repository documents this limitation explicitly. [Local launch sequence](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/app-dev.ts#L280-L339), [local media limitation](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/docs/README.md#L121-L165), [Vite proxy configuration](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/vite.config.ts#L63-L69).

The snapshot table-number failure is a separate defect. It does not justify repairing production, and fixing it alone would not add local publication. A whole-catalogue snapshot is also unnecessary for the focused GF9 review dataset.

## Evidence and limits of this investigation

- Read the map and full research child. Verified that the child was assigned to `ndelangen` before work.
- Ran `bun run worktree:setup`. It fetched `real-origin` and verified this clean detached worktree at the inspected main commit before the report edit.
- Read launcher, provisioning, auth, anonymiser, publisher, storage, capture, image-ingest and delivery source, plus the prior GF9 startup log and delivery archive.
- Exercised only the pure local-instance allocator with `bun --no-env-file`. Two calls returned distinct Compose project names. Each topology had four distinct ports and four loopback origins. The environment overrides selected the allocated local URLs and removed an inherited local admin-key value. This proves the allocator's returned values, not a live startup.
- Counted the checked-in GF9 package and its references directly. It has 251 items, 235 assets, twelve factions and four books. Its SHA-256 is `63c24febdf92ce090170b1c655caad9c541e0e99c21714b457b7b209e801f039`.
- Did not start Docker, Vite, a Worker, a browser or a hosted deployment. Did not export, import, mutate, enqueue or read administrative production state. No runtime end-to-end or full test suite was run in this research worktree. Dependencies were not installed here.

Historical successful fixture/import evidence belongs to the first delivery. It is useful context, but it is not a fresh exercise of this commit. The archived local seed result records 42 stock assets and 32 relations, inserted as 74 local documents. It used a disposable local owner and local slugs. That ad hoc seed is not a supported reproducible GF9 launch command.

## What exists today

### Database, identity and lifecycle

`bun run app:dev --local` owns a fresh Docker Compose project and volume per launch, allocates app/backend/site/dashboard ports, configures local auth, pushes the checked-out code, loads data, runs required migrations, creates two test accounts through sign-in, seeds fixtures and remaps factions and Groups. It then runs Vite and a local Convex watcher together. Bare `app:dev` uses the configured hosted deployment and is unsuitable for this work. [Launcher](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/app-dev.ts#L225-L339), [allocated topology](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/local-dev-instance.ts#L39-L75).

The local Password provider needs both test flags and a backend whose canonical backend/site URLs are loopback. The launcher generates fresh JWT material. Its account creation helper uses the app's login form rather than fabricating a production identity. These are local credentials, unrelated to the signed-in production maintainer. [Auth gate](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/auth.ts#L13-L18), [loopback predicate](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/lib/isolatedBackend.ts#L1-L20), [local login helper](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/local-dev-auth.ts#L1-L49), [auth provisioning](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/provision.ts#L305-L335).

Local Convex commands receive explicit self-hosted target arguments and have hosted deployment credentials removed. Application child processes also lose the local admin key and test passwords. This is a useful existing boundary. It does not automatically sanitize credentials or target URLs in a new publisher process, because that process does not exist yet. [Command environments](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/provision.ts#L136-L167), [explicit CLI targeting](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/provision.ts#L240-L252).

Normal shutdown removes only the launch's containers, volume and private temporary directory. A hard kill can leave them behind; the launcher prints a project-specific cleanup command. Therefore the current launch is disposable, not a persistent authoring database. Reset and restart must rebuild reviewed data from durable files, or a separately specified local checkpoint must be added. [Supervisor cleanup](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/app-dev.sh#L10-L64), [documented crash recovery](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/docs/README.md#L194-L223).

In snapshot mode, the placeholder owns assets and Rulesets. Current remapping hands factions and Groups to reviewer A and makes reviewer B a Group member, but does not reassign every asset or Ruleset. A can edit grouped content through membership, with owner-only operations still restricted. Do not promise that all snapshot records become owned by A. [Remapping](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/provision.ts#L610-L642), [documented ownership limits](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/docs/README.md#L218-L223).

### Publication and storage

Normal saves enqueue local `publication_jobs` through the normal mutation path. Enqueueing itself has no `IS_TEST` bypass that would send a local save elsewhere. Image pickup defaults to disabled when settings are absent; initialization also sets pickup false. Some faction-derived image types require active renderer revisions. Rulebook HTML/PDF artifacts use a separate preparing-artifact work path. Turning on an image setting alone would not establish the rest of the publisher. [Enqueue logic](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/lib/publication.ts#L97-L146), [pickup and revision gates](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/publicationJobs.ts#L108-L177), [initial settings](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/publicationAdmin.ts#L26-L52), [Rulebook work](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/rulebookEditionArtifactWork.ts#L65-L108).

The production Worker owns scheduled execution and delivery. It uses a Browser binding for captures, Images for JPEG encoding, an asset bucket for publications and PDF capture staging, a user-image bucket for ingested covers, and media buckets for raster originals, variants and release records. Its checked-in configuration points at production origins and named production buckets. The `.dev.vars.example` supplies only a placeholder executor secret. Running the production Wrangler configuration without an explicit local contract is not an established isolated environment. [Worker bindings and targets](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/wrangler.jsonc), [publisher lifecycle](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/README.md#L1-L41).

Executor calls authenticate against a deployment-specific secret configured in Convex. Missing or conflicting secrets refuse the request. The current launcher does not configure an executor secret or image-ingest origin. Publisher configuration requires HTTPS for public, capture, render and executor URLs, while the current local topology is HTTP loopback. The capture route validates its render URL with the same HTTPS function. A local transport decision and explicit target injection are required before these paths can communicate. Do not loosen production URL validation globally to make a local demo work. [Executor authentication](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/http.ts#L32-L47), [missing-secret behavior](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/lib/publicationHttp.ts#L24-L43), [HTTPS configuration](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/config.ts#L29-L63), [capture render fetch](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/capture-route.ts#L100-L113).

The production Browser adapter calls `@cloudflare/playwright` with the provider binding. Existing local capture regression code instead starts local Chromium and serves synthetic capture snapshots. That proves there are reusable capture contracts, not that Cloudflare Browser and Images can be replaced by changing a URL. The JPEG path also asserts progressive encoding and exact dimensions. A future local adapter must satisfy those checks. [Provider Browser adapter](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/browser.ts#L463-L474), [local capture regression](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/capture-contract-regression.ts#L196-L230), [JPEG contract](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/image-encode.ts#L10-L55).

Public image URLs are relative `/published/...` paths keyed by entity IDs. A query token busts caches; it does not select an old version. Copying a URL into local Convex without serving its object leaves a missing local image. Rulebook HTML/PDF artifacts have immutable Edition identities, while ordinary image outputs use their current stable object. Keep those distinct during reset and comparison. [Public paths](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/asset-publishing/publicationTargets.ts#L285-L308), [delivery contracts](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/README.md#L130-L156).

### Cover ingest, artwork and fonts

Ruleset logos and book covers use authenticated image ingest, not merely a stored source URL. Convex mints a single-use capability; the Worker checks it against the configured local ledger, fetches and re-encodes the image, writes its bucket and consumes the capability in that ledger. Convex requires `USER_IMAGE_INGEST_BASE_URL`; current local provisioning never sets it. The contract permits local HTTP delivery/ingest hosts, but author-supplied source URLs must still be full HTTPS URLs. A local file is not currently an accepted source URL. [Ingest configuration](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/convex/lib/userImageIngest.ts#L33-L48), [ingest protocol](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/user-images.ts#L19-L33), [source URL and delivery rules](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/user-images/contract.ts#L100-L135), [local delivery allowance](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/user-images/contract.ts#L184-L204).

The existing package uses checked-in `/image/` and `/vector/` artwork references. Production raster delivery also has content-addressed `/m/` variants. Local and CI publisher builds retain bundled raster copies as fallbacks; production builds intentionally omit them after upload. A local review build must retain those copies or populate only its own media store. New original GF9 covers and the GF9 logo need verified source bytes and local ingest, not a promise that a production bucket will fill in the missing file. [Media delivery and local fallback](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/README.md#L62-L109), [package artwork provenance](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/content/gf9/README.md#L93-L99).

Reuse the real capture bundle, render document projection, shared font checks and actual HTML/PDF executors. Static Rulebook HTML embeds its required fonts. The PDF code verifies page resources and embedded fonts. Local font substitution or a hand-built replacement document would weaken comparison with production. [HTML fonts](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/rulebook-html.ts#L1-L53), [exact font readiness](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/asset-publishing/publisher-fonts.ts), [PDF resource validation](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/workers/publisher/rulebook-pdf.ts#L170-L225).

## The snapshot failure

The preserved `/tmp/gf9-local-snapshot.log` records a launch against a new disposable local backend. It downloaded the anonymised snapshot dated `2026-10-19T10:47:55Z`, configured auth environment, pushed the current schema and then failed in `convex import --replace-all`:

```text
conflict between `authAccounts` and `board_readiness` with table number 10051
```

The failure occurred before the launch's two users signed in. Therefore "the user-login seed caused the collision" is unsupported. Configuring auth environment is not the same operation as inserting auth accounts.

The source shows three relevant facts:

1. The local sequence pushes the schema before snapshot import.
2. The anonymiser preserves original numeric table IDs and document IDs for kept tables, and writes only kept tables into `_tables/documents.jsonl`.
3. `board_readiness` is kept; auth tables and publication jobs/settings are dropped.

These facts make a source/target table-allocation conflict a useful hypothesis. They do not establish which table allocation or importer behavior caused it. No source snapshot archive or target table-map capture from the failed launch was retained in the inspected evidence. [Actual ordering](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/app-dev.ts#L296-L321), [snapshot table-map writer](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/lib/snapshot-anonymiser.ts#L563-L569), [table policy](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/lib/snapshot-policy.ts#L99-L165).

A snapshot repair investigation must capture both table maps and runtime versions on disposable instances, reproduce before changing the sequence, and prove restart, sign-in, reference integrity and migration success afterward. Do not edit encoded IDs or drop tables based only on the number in the error. This research does not select a remapping or provisioning-order fix.

For GF9, the recommended route avoids `convex import --replace-all`: load a narrow content baseline through existing validated local writes, giving records new local IDs and retaining a binding manifest. This is a content fixture assembled from public data, not a raw production database export. The existing anonymised snapshot workflow and its defect can remain separately tracked unless the map chooses the snapshot path.

## Minimum GF9 source dataset

The reviewed source package already has full data for all 251 items, including the 42 stock reuse declarations. It has 13 explicit slug bindings and ordered deck/bundle members. Its four books currently have 45, 14, 15 and 18 pages. These are baseline counts, not requirements for the corrected pagination. The package does not contain a Ruleset/Group creation operation, operational publications, import receipts, account credentials or current production draft state. [Package](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/content/gf9/package.json), [package schema and binding contract](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/src/shared/contentImports/package.ts#L15-L151).

The reproducible local dataset should contain:

| Input | Required contents and reason |
| --- | --- |
| Reviewed authored baseline | Versioned GF9 package, source commit and content hash. Keep later corrections as explicit reviewed files. |
| Fresh public target baseline | Read-only public responses for the GF9 Ruleset/Group, twelve factions, four current book readers, their Edition metadata, all package assets and container relations. Record acquisition time and endpoint. Public reads do not establish an unpublished draft's current state. |
| Minimal dependency closure | Referenced assets/factions/containers, cardback and front presets needed by those records, current counts and stock definitions. Include the accepted board geometry. Do not import unrelated Rulesets merely because a stock record also belongs to them. Record those links separately for production preservation checks. |
| Media inputs | Original cover/logo source bytes and provenance, checked-in illustrations and all non-bundled user images used by GF9. Hash bytes, record dimensions and MIME type, and resolve them locally. An archived finished image is reference evidence, not a substitute for regenerating changed content. |
| Identity/binding manifest | For each logical key, record kind/type, baseline production ID and slug, local ID and slug, explicit reference paths, current expected content hash and intended batch. Keep deployment IDs separate. |
| Association baseline | GF9 Group assignment, Ruleset slots, faction order, deck/bundle member quantities and unrelated stock links that production must preserve. |
| Draft/state check | At eventual authenticated production preview, verify current saved draft/revision and permissions. Stop on drift or unpublished changes rather than treating an old public read as authoritative. |

The first-pass archive has a useful 251-key production binding map, 42-stock preservation evidence, actual PDFs/images and before snapshots. Its final verification JSON is an audit report, not a full data backup. Reacquire current public content and use authenticated concurrency checks before the future writes. Do not restore a local database from that audit report.

Local document IDs can differ. Preserve logical Page/Block identities where meaningful, but resolve their actual ownership and repagination rules in the authoring decision. Never rewrite arbitrary strings that resemble IDs. Use explicit known reference paths. The current package only binds faction extra-asset slugs, so future illustrated books will need their own documented local/production bindings.

## Recommended local-runtime contract

This is the minimum behavior for an implementation ticket, not an already implemented command.

### Startup and reset

1. Fetch the selected code base and use its pinned Node/Bun/dependencies. Launch with an explicit local mode, never the bare shared integration command.
2. Allocate a unique session ID, loopback ports, Docker volume, publication store and temporary secret directory. Print a non-secret manifest with source commit, content hash, owner label, target URLs and owned resource names.
3. Reject hosted mutation targets, remote storage bindings and inherited production/development deployment credentials before starting any process. Generate a fresh local executor secret and configure only the local Convex HTTP routes. Do not reuse a production executor or activation secret.
4. Start local Convex, migrations and normal local sign-in. Provision one local GF9 Group and Ruleset for reviewer A; reviewer B may exercise collaborative permissions. Give the new local dataset explicit local ownership. Do not copy production user IDs into these writes.
5. Populate the dependency closure and GF9 baseline. Resolve existing local stock only after kind/type, identity and canonical data checks; otherwise create local copies. Fail clearly on slug collisions. Capture resulting IDs and reference bindings.
6. Start isolated publication execution, local delivery and image ingest. Initialize only local publication settings/revisions after the matching renderer is ready. Expose a visible local-environment marker in the app and generated review manifest.
7. Declare readiness only after an app save, local job completion, artifact fetch and decode have succeeded. A listening port is insufficient.
8. Reset creates a fresh environment from the same durable authored inputs and manifest contract. Local IDs may change; normalized content, associations, text and layout must reproduce. Keep reviewed JSON outside disposable volumes.

The user asked to extend the existing Load flow with raw JSON and then use normal Save/Publish. This research does not propose a generic export platform or a second production administrative importer. The exact per-entity JSON contracts belong to the Load investigation.

### Local publication execution

The smallest scope is the publisher behavior GF9 uses: faction sheets and derived faces, authored asset images/cardbacks, book first-page images, Rulebook HTML/PDF and cover/logo ingest. Reuse shared payload validation, the built capture document, font readiness, geometry, JPEG checks, artifact identity and delivery handlers.

Prefer local execution adapters for browser capture, image encoding and object storage, with writes pinned to this local session. A local Chromium capture service and local persisted object-store emulator are plausible implementations. Their compatibility is unproved here. Do not silently enable a remote Browser or Images binding or tunnel credentials to production. A separate prerequisite decision must select and exercise the actual adapter/transport design.

The delivery origin must serve real image/PDF/HTML bytes at the relative public paths the app returns. It must also serve bundled artwork, font files, local `/user-images/` output and the capture document. Missing artwork must fail visibly rather than fall through to SPA HTML or fetch a current production publication. Source artwork may be downloaded read-only from an approved HTTPS source during acquisition, then hashed and served locally.

A local worker or runner may drain local work promptly for review, but must retain normal pending/in-progress/completed/failed behavior, stale-save handling and artifact validation. It must not add a production force-pickup route or bypass ownership checks. Resource limits must bound concurrency, browser sessions, capture deadlines, retries, artifact sizes and disk usage. Use existing production limits as the starting contract; expose local-only scheduling through the development launcher.

### Parity and promotion evidence

Review must inspect the saved local application, its reader, generated first-page covers, faction/card faces and actual downloadable HTML/PDF. A static composition screenshot alone does not pass. Regenerate dependency images before books that embed or resolve them.

Use the same code commit, renderer identity, authored content and media bytes for review and production. Environment IDs, origins, cache tokens, timestamps and PDF metadata can differ. Compare normalized references and semantic text, physical page boxes, layout, fonts, image geometry and visual output. Do not require byte-identical PDFs across different entity IDs or timestamps.

The reviewed output becomes two explicit production update manifests. The first contains the selected faction/asset/logo changes. The second contains the four books only after their dependencies and new publications pass. Neither manifest may carry local owners, credentials, object-store paths or local IDs. Resolve logical references against the verified production binding manifest and current authenticated state. The local runtime has no production promotion mutation of its own.

## Observable acceptance

An implementation is ready for content review only when it records all of the following:

1. Two simultaneous local sessions have different Convex, object-store, job and artifact identities. Editing one leaves the other unchanged. Each startup manifest and app marker identifies the owned session.
2. Reviewer A signs in through the normal local login, edits a faction and a card through Load/raw JSON plus Save, edits a book draft and publishes locally. Unauthorized/sign-out attempts fail through normal policy.
3. The local faction save creates only local jobs. The local executor takes those jobs and records new local completion tokens. The app's resulting images decode with the required dimensions, and changed text is visibly present. Repeat while a prior capture is in progress to test stale-result handling.
4. A local book publish produces its own HTML, PDF and first-page image. Fetch every result through the local application origin. Verify MIME type and magic bytes, page count, original GF9 physical format, embedded fonts, instructional illustrations and links. Missing source media blocks acceptance.
5. The Ruleset logo and an original cover exercise local token mint/check/consume and local image storage. Tokens are single-use and the returned image URLs point locally. A normal authenticated content save uses those images.
6. Record network destinations and local ledger changes while saving and publishing. All write-capable calls target loopback/local resources. Tests with hosted URL/credential sentinels fail closed before commands or requests. Production/shared-dev mutation endpoints and production storage writes are absent. A read-only production queue count alone cannot prove isolation because unrelated work may change it.
7. Stop the launch normally and confirm only its owned resources disappear. Exercise startup failure cleanup, document hard-crash cleanup and prove a fresh reset reproduces reviewed normalized content. Do not stop another worktree's containers or server.
8. Generate a dependency-complete change manifest for both future batches. Review a three-way comparison between captured production baseline, local corrections and fresh authenticated production state. Detect drift, preserve unrelated stock associations and prove retry is idempotent. No actual production writes are required to establish local readiness.

Keep functional evidence distinct from visual evidence. A passing unit test, static PDF renderer, available URL or old production cache token does not prove this entire list.

## Further tickets and remaining choices

The research question is answered: the database/auth foundation exists, complete publication and delivery do not, and the snapshot failure has no established root cause. The follow-on decision is [Choose the isolated publishing runtime for local GF9 review](https://github.com/ndelangen/dunezone/issues/2367). Its resolution should select the publisher/ingest/delivery design and transport, followed by a cheap local end-to-end proof. That proof must cover real Convex records, local job completion and actual image/HTML/PDF bytes, not synthetic payloads alone.

The map also needs an explicit baseline/ownership and binding decision, coordinated with the existing Load contract investigation. Recommend the narrow public-content/package route above. If the user instead requires the anonymised snapshot, reproduce and fix the table-number conflict first. Keep snapshot repair separate if it is not needed for GF9.

The runtime research cannot settle these remaining product choices on the user's behalf:

- Whether local review edits are always persisted as reviewed JSON files, or whether named local database checkpoints must survive stop/restart. The recommended minimal contract rebuilds from files.
- Whether source cover/logo artwork can be supplied as reviewed publicly reachable HTTPS inputs to the existing ingest flow, or whether the correction needs a separate authenticated file-upload capability. The current flow takes URLs.
- The exact review approval checkpoint before either production batch. The user has chosen two batches, but this report does not invent the sign-off artifact or broaden production write authorization.

## Local evidence pointers

These files were inspected outside the research worktree. They are context, not portable source dependencies:

- `/tmp/gf9-local-snapshot.log`, failed snapshot startup and final table conflict near line 447.
- `/tmp/gf9-local-stock-seed-result.json`, historical local fixture stock result.
- `/Users/me/Projects/Dune/gf9-delivery/README.md`, original delivery and artifact index.
- `/Users/me/Projects/Dune/gf9-delivery/gf9-production-verification-2026-10-20T02-48-35-943Z-report.json`, archived binding/publication/preservation audit.
- `/Users/me/Projects/Dune/gf9-delivery/gf9-import-package.json`, matching first-pass package.
- `/Users/me/Projects/Dune/gf9-before-import-2026-10-20.json`, immutable original adopted-stock baseline. Do not overwrite it with a new capture.

Prior memory was used only to locate the canonical research ticket and local-targeting history. All runtime conclusions above were checked against the cited current source or the named historical evidence.
