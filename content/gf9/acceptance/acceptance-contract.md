# GF9 correction acceptance contract

Resolved through live discussion for [Define GF9 rules and visual acceptance evidence](https://github.com/ndelangen/dunezone/issues/2364), part of [GF9 correction: local review and two production content batches](https://github.com/ndelangen/dunezone/issues/2357). This is an implementation acceptance contract, not a report that the content audit has passed.

## The user's review and delivery order

The user clarified that this project is about correct content. PDF creation already belongs to the existing publishing system. The user does not need to inspect PDFs and does not require a physical printed proof.

Use this order:

1. Deliver the required compatible application code and bitmap/media additions to production through the normal reviewed release workflow. This is separate from applying the GF9 content corrections.
2. Bring the persistent local Dune Zone copy onto that deployed application code and registered media. Retain its authored files, local database, auth and publisher storage. Pulling code never means replacing authoring work with another snapshot.
3. Verify the complete GF9 content against the real saved local result, using the deployed renderers and media. Fix content defects locally. If a required code/media correction is discovered, deliver it first, refresh the local copy and repeat the affected checks.
4. Show the user all four complete Rulebooks in the local web reader before putting their content into production. Provide navigable links to the actual saved local books and their complete page sequences. A set of representative samples, screenshots or PDFs does not replace this review.
5. Apply the reviewed production content through the two agreed authenticated batches. The next batch decision owns exact entry gates, order, activation and recovery. Rulebook production updates require the user's approval of the complete local books.

The earlier PDF-proof answer is superseded by that clarification. Do not add a separate human PDF-approval step or rebuild/reprove the PDF creation system as a content prerequisite. Use the existing publication system normally. Changes that affect publishing still receive their appropriate code regression checks. Agents may use an existing export to investigate a content defect, but PDF inspection is not the user's content-review interface.

## Authority, scope and evidence identity

Follow the resolved [authoring contract](https://github.com/ndelangen/dunezone/issues/2363#issuecomment-6288792502), [page composition](https://github.com/ndelangen/dunezone/issues/2361#issuecomment-6288339539), [component treatments](https://github.com/ndelangen/dunezone/issues/2362#issuecomment-6292530247) and [persistent local runtime](https://github.com/ndelangen/dunezone/issues/2367#issuecomment-6287147758). Component reference commit is 2981ba532; page reference commit is e8b8d09fa. Their resolutions own the exact approved visual treatments. Old manuscripts, old packages and earlier reports are historical evidence, not proof that newly composed content passes.

Review the complete inventory: four books, twelve factions, the Ruleset logo, every GF9 catalogue asset, deck/bundle membership, Ruleset slot and Faction Extra. Changed/added assets are a subset, so an unchanged record cannot silently escape review. Prior evidence can carry forward only when its exact identities, source/authored hashes and artifact identity still match and the prior check meets this contract. Also check relevant non-GF9 consumers of changed shared code.

Preserve entity/member identities, ownership, Group and unrelated stock. Membership/count changes require an explicit reviewed inventory correction. The geometry-only board is accepted. FAQ entries/Q&A pages remain excluded. Trusted FAQ material can inform ordinary rules through recorded judgements; do not reverify the supplied external citations without new contradictory evidence. Source and research records stay outside the visible books.

Use `content/gf9/review/<run>/manifest.json` with durable linked evidence. Record authored commit, deployed code/renderer identity, local code identity, registered media/source hashes, environment bindings, expected inventory, saved local revisions and actual generated image/artifact identities. Snapshot document IDs may equal production IDs; verify every destination binding rather than inferring an environment from its ID value.

Every check records check ID, semantic target key, actual kind/ID, checked saved revision, reviewer, evidence location, result and finding references. Results are pass, fail, blocked or accepted limitation. A limitation names the earlier human decision and its exact scope; it cannot excuse a new defect. No localhost link or ignored temporary file is the only durable evidence. The running local reader remains the user's interactive review surface.

## Independent review roles

- The author composes the content and maintains coverage, judgements and inventory, then fixes findings.
- A separate rules reviewer checks the actual authored/saved content against applicable supplied sources and judgement records. Assign every book/faction/asset; no unowned remainder. Reviewing the author's summary alone is insufficient.
- A separate visual reviewer checks every final Page and every unique component front/back against the accepted treatment and original references. They cannot provide the independent pass on their own authored work.
- A workflow reviewer verifies real authenticated saved data, references and publication results. This may be a rules/visual reviewer who did not author the checked workflow.
- The coordinator assesses findings, records corrections or rejection reasons, and obtains re-review after fixes. Unresolved defects block affected content and consumers.

Agents perform routine checks, fixes and delegated rules judgements. Record competing claims, chosen interpretation, reason, affected keys and independent disposition in GF9 judgements. A recorded agreed judgement resolves a contradiction; an unresolved rules disagreement blocks the affected content. Ask the user for new product decisions or required changes to settled designs, rather than making the user police routine defects.

The user reviews all four complete newly composed books once, through the local reader. Freeze their reviewed authoring commit and saved revisions while presenting them. Include already accepted covers naturally in the books without asking the user to approve their design again. After corrections, show changed material with context. Do not imply that approval of samples or token treatments approves previously unseen pages or component faces.

## Rules and content acceptance matrix

Apply these rows to each of the four books, all twelve factions and every GF9 asset/container. Maintain a per-target result for each applicable row and explain inapplicable rows.

| Check | Required evidence | Failure conditions |
| --- | --- | --- |
| Complete coverage in both directions | Every required normative source clause maps to authored Page/Block/field or an explicit disposition. Every authored normative statement and faction/card/token field maps back to a source or recorded judgement. | Missing rules, unsupported additions, dangling mapping targets or a completeness claim based only on chapter/keyword counts. Machines check mapping structure; the independent reviewer checks meaning. |
| Source precedence and dispositions | Each clause is retained, combined without loss, explicitly superseded by a named correction/replacement, or deliberately excluded with a reason. Link relevant versions and judgements. | An obsolete printing controls a replacement, a community house rule silently becomes default, or required content disappears during pagination. Lore/credits/research prose may be omitted deliberately. |
| Basic, Advanced and optional scope | Chapter openings and relevant exceptions state applicability. Powers retain phase, trigger, cost, limits and faction/alliance scope. | Optional rules become unconditional, exceptions disappear, or scope labels are repeated as heading boilerplate. |
| Numerical and component accuracy | Source-derived expected inventory compared with actual saved quantities, setup, strengths, costs, movement, revival and victory requirements. Twenty forces per faction, including correct split types. | Wrong quantities or comparing a package only with values derived from itself. Preserve source-backed leader/member identities. |
| Decks, bundles and Extras | Verify members/counts, backs, Ruleset slots, Faction Extra bindings and current replacements. Main Karama has two copies and a separate Richese cache member. Six Discovery blows and Great Maker retain distinct roles; Hiereg/Smuggler pool remains four of each. | Duplicate replacement records, wrong counts/references or illustration markers entering the random outcome pool. |
| Legal examples | Work each example from its stated initial position through legal actions to its stated result. Label examples as reviewed derivations from named rules. | Illegal shipment/movement/cost/range, storm, stronghold/advisor entry, collection, battle or victory result. Diagram and prose must agree. |
| Editorial exclusions and formatting | Scan and inspect all titles/Blocks: no FAQ/Q&A section, repeated Sources prose or literal GF9 prefix on visible faction/asset titles. Retain meaningful bold and other formatting. | Research boilerplate returns, old abbreviations replace full names or formatting that carries content is lost. Do not delete legitimate game text merely because a scan flags a word. |
| Cross-surface agreement | Books, faction sheets, current cards/tokens and their explanations agree on timing, exceptions and quantities. | Current Karama wording, Discovery destinations, token effects or faction powers contradict another presented surface without a resolved judgement. |

The coverage sidecar records source ID/hash, PDF page or trusted FAQ entry, clause ID, applicability, destination semantic key/field, disposition and judgement. Existing research coverage is a starting point; remap it to the new composition and re-review it. Research citations do not become printed page sections.

## Local visual content matrix

Inspect the actual saved local reader and published component images after refreshing to deployed code/media. Every Page has its own result; every unique component front/back has a result. Contact sheets help coverage but do not replace readable full views.

| Check | Required evidence | Failure conditions |
| --- | --- | --- |
| Original book formats | Saved settings and actual local page geometry use core 254 by 254 mm and expansions 132.08 by 254 mm, with correct orientation/aspect. | A4 fallback, distortion or accidental format changes. No arbitrary final Page count; preserve the current 100-Page publication limit. |
| Covers and source quality | All four accepted full covers survive normal saved rendering without new text overlays/cropping. Record real rendition dimensions and compare internally with the accepted baseline. | Lower-quality replacement, accidental old rendition/profile or changed appearance without review. Accepted source-detail limits remain explicit; upscaling does not add source detail. |
| Reading order and teaching flow | Inspect every final Page's ordered regions/Blocks, column sequence, headings, captions and adjacent component illustrations. Shipment and Movement retains its full strategic visual progression. | Wrong reading order, distant identification images, tiny/ambiguous counters, missing consequences or return to rejected all-single-column core/heading spam. |
| Text and artwork fit | Check full glyph bounds, legibility, fonts and image proportions in the reader and actual component publications. Card titles stay complete on one line through the common fitter. | Clipped/overlapping required text, wrong fonts, unreadable content, capped titles, missing images/SVG roots, wrong source, stretched art or symbol overprint. |
| No lost rules through clipping | Inspect overflow warnings and actual informative bounds. Required GF9 rule/instruction text must be fully visible. Deliberate decorative framing can be recorded. | Missing required text or accidental informative-art clipping. This is a GF9 content gate; the app's general non-blocking Rulebook clipping behavior remains unchanged. |
| Accepted faction/component treatments | Compare real local output with the accepted component specification and provenance. Include full names, portraits, logo square crop, CHOAM-only split/empty logo, Richese grey, BG connector, Vidal clauses and Karama replacement. | New trace/invented CHOAM emblem, wrong crop, abbreviated title, lost clause or obsolete art/text. CHOAM's intentionally empty logo is the named blank-art exception. |
| Discovery cards and tokens | Verify actual linked-board geometry, both territory tints, source-checked native marker points, map/paper look, standard amount placement, token above and intact bold instructions. Use approved shared grayscale texture, enlarged existing Fremen/Guild vectors and saved styling. | Embedded map bitmap, wrong destination/sector, wrong tint role, new vectors, coloured texture source, outer extraction seam, lost styling or prototype-only CSS standing in for saved behavior. |
| Full inventory and unchanged members | Check remaining GF9 members as well as changed records. Carry prior results only on exact qualifying evidence matches. | An untouched but incorrect member escapes because it was not on the edit list. Unseen output is never declared approved. |

Accepted covers, composition principles and component appearances remain settled. Only changed appearance or a named incompatibility needs a new design decision. The user still sees every complete book because the complete newly composed content has not yet been reviewed.

## Technical readiness and saved-content checks

These support content delivery. They do not create a new PDF project or substitute code tests for content review.

| Check | Required evidence | Pass condition |
| --- | --- | --- |
| Code/media deployed first | Normal merged/released code identity and registered bitmap/media hashes, with compatible defaults for existing records. Separate Astra High code and architecture reviews at every implementation PR's final head; assess other AI findings, required CI/audits and focused live verification. | The required code and bitmap additions are actually on production before the final local content review. A prototype, unmerged branch, local media file or healthy old release is insufficient. |
| Local matches deployed rendering | Pull the deployed application code into the persistent local copy, retaining its DB/auth/storage and authored files. Record both identities and actual media references. | No unpublished renderer override or prototype CSS. A code pull does not refresh the snapshot over work. A later relevant renderer/media change invalidates affected visual results. |
| Draft-only Load and permissions | Exercise the existing raw Load/Save flows for Asset, Faction and Rulebook, including Cancel/Reset, errors, late validation, opt-in rename and capability checks. | Load changes only the draft. Normal Save controls writes and rehost. Preserve identity, ownership, Group, membership and component UUIDs; no fabricated identity or administrative bypass. |
| Saved/file round trip | Prepare, normal Load/Save, authenticated Download JSON, collect and prepare again. Compare actual saved values after documented normalization. | Versioned authored files, typed bindings and saved local data agree. Unknown references/uncollected local edits block affected preparation; account for unsaved editors. |
| Settings and links | Verify settings-only Save/revision and normal Publish behavior. Test current contents/direct anchors, split/replacement mappings and explicit historical Edition links. | Settings and Contents persist together. Page/layout/Block ownership follows the authoring contract. No localhost origin or unresolved local-only reference in production preparation; every destination ID/type is verified even when snapshot IDs happen to match. Historical saved text and completed artifacts are not rewritten. |
| Illustration-layout controls | Focused renderer/saved-data proof for all imageSide/textFlow combinations, card and non-card sources, short/long text, both book widths, reader and existing export output. Exercise defaults and unavailable-source behavior. | Missing fields retain left/beside behavior; data survives Save, Edition and export/collect. Real GF9 illustrations still must be complete. This checks the changed Block contract, not PDF creation infrastructure. |
| Applicable image rehost | Normal authenticated cover/logo/portrait source rehost where the record uses that path. Match approved source hashes and returned metadata. | Required dedicated cover profile preserves 3000-pixel maximum edge, scale-down-only quality-90 progressive JPEG and source proportions. Prove normal Save/rehost/capture rather than direct-file bypass or fabricated stored metadata. |
| Maintained artwork registration | Normal maintained-media ingestion/catalogue generation/variants for maintained extracts and the new grayscale texture, then normal authenticated selection/Save of references. | Exact approved bytes are registered and resolvable locally/production. Do not invent rehosting for maintained-media references. |
| Identity-preserving type conversion | Exercise actual six Custom-to-Spice updates, prior URLs, reverse dependencies, publications and dependent book references. | Correct destination type and board/token sources, retained entity IDs/counts and no duplicate replacement records or stale old-type outputs. |
| Final input budget | Measure the completed largest UTF-8 payload and applicable writer/publication bounds. | Respect 512 KiB, depth 64, 50,000 structural nodes and existing per-type/100-Page limits. Record actual overages and resolve limits explicitly; never truncate content or artwork. |
| Real publication result | Use normal existing Publish/capture and retrieve the resulting reader/component output. Record source revision, renderer identity and exact artifact identity/hash. | Reviewed saved content is actually displayed. Import success, a pending job, server health or an old artifact cannot prove this. No separate human PDF sign-off. |
| Shared-code regression | Follow the repository confidence stack with schema-derived types, public seams and a few real normal-flow exercises, plus focused renderer/publisher regressions for changed behavior. | Ordinary/non-GF9 consumers and existing defaults remain correct. Do not add redundant tests per entity, source-text tests of code, or general PDF-system requalification. |

The authenticated cover path and final payload-budget checks remain gates inherited from the authoring decision. If a data-dependent limit or rendering problem appears after deployment, fix and release the required support, refresh locally and repeat affected content checks before asking for the user's full-book approval.

## Findings, review presentation and handoff

Maintain a finding register with target keys, evidence, owner, severity, fix or rejection reason and independent final result. Incorrect/missing required rules, unsupported additions, illegal examples, wrong counts/references, lost text, wrong format, unproved identity or stale output block affected content and consumers. A minor cosmetic note can be non-blocking only when it demonstrably preserves the accepted appearance/readability and is documented; it cannot conceal a new downgrade.

Recheck affected rows and consumers after a change. Rule precedence changes reopen their clause mappings; renderer/font/media changes reopen affected appearance checks even if text is unchanged. Do not rerun unrelated audits or ask the user to reapprove unchanged accepted artwork.

Before showing the four books, independent rules/visual/workflow reviewers sign off the exact local saved result. Present all four complete web-readable Rulebooks with their names, full page access, a short change summary and any unresolved limitation. Do not ask the user to review a book with a known blocking defect. Preserve the reviewed authored commit and saved revisions; subsequent edits receive affected re-review.

The handoff includes source/judgement coverage, the full expected inventory, saved local identities, exact code/media baseline, prepared binding reports, independent findings/results and links/screenshots for the complete local books. The user's full-book approval is recorded against those identities before production book updates.

[Define the two authenticated GF9 production content batches](https://github.com/ndelangen/dunezone/issues/2365) owns exact production order, public activation, partial failure/retry and forward recovery after these gates. Preserve the two content batches separately from code/media deployment. Older web editions may show corrected live artwork; saved historical text and completed PDF/HTML bytes remain unchanged. No whole-catalogue atomic release, administrative recovery or new production merge platform is implied.
