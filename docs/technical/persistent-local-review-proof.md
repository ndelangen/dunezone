# Persistent local review proof

Verified on 20 October 2026 with Node 24.21.0, Bun 1.4.2 and the frozen dependency graph. This proves the local runtime and normal authenticated publication. The authored text contains explicit runtime markers and does not approve final GF9 content or cover composition.

## Two isolated environments

| Property | Review A | Review B |
| --- | --- | --- |
| Persistent directory | `/Users/me/Projects/Dune/gf9-runtime-proof-a` | `/Users/me/Projects/Dune/gf9-runtime-proof-b` |
| App origin | `http://127.0.0.1:31656` | `http://127.0.0.1:14564` |
| Backend / site / publisher ports | 31657 / 31658 / 31660 | 14565 / 14566 / 14568 |
| Docker project | `dunezone-local-4bb8c0ba-1575-473e-a5df-6f37d5d9392d` | `dunezone-local-13fcabc5-4c0f-4b38-a9fb-4593af963d56` |
| Saved card subtype | `Advanced Atreides local proof 2` | `Advanced Atreides` |
| Same rehosted cover path | HTTP 200 | HTTP 404 |

Both first launches imported the trusted published-only snapshot before pushing the application schema. Snapshot run `39391393256`, artifact `12249482375`, created `2026-10-20T08:10:09.000Z`, has SHA-256 `2c08d723ff5f67a987570699eea710c19765131805a26df61fb875d8da68a3e6`. All required migrations completed. Their auth keys differ. Each copied publisher build contains its own backend URL in five files and the other backend URL in zero files.

The two-env comparison recorded Edition 3 in A and Edition 1 in B. Further authenticated publication advanced A to Edition 5 while B retained Edition 1. A second launcher and a reset attempt both refused the active OS lock before changing services.

## Normal authoring, cover ingest and publication

Reviewer A signed in through the local Password flow, saved a faction name and card subtype, then saved and published the Ixians & Tleilaxu Rulebook through its normal editor. No supplied identity or administrative content mutation performed those saves or publications.

This integration run used a temporary dedicated cover rendition, which was later removed in favor of stock cover presets. The cover source was the approved `ixian-cover.png` at commit `8f932fcbbf538ecbfa66aefe4d45308cc3158f5f` in `content/gf9/artwork/originals`. The normal authenticated ingest capability names `rulebook_cover` and Rulebook `pd757fwer2cfxyq4m9b4z446kx8gmb1g`. The consuming callback recorded the source URL, exact stored dimensions and R2 key, and marked the capability consumed. The stored JPEG is progressive, 1560 by 3000 pixels and 427998 bytes. Its SHA-256 and local delivery key are `cfce5d1a2aa33d1eab50184ba23389efb830cae621ea911096cd51507ba66242` and that hash plus `.jpg`. No upscale was needed.

The existing publisher completed HTML, a fourteen-page PDF and its cover. Its completion log reports zero failed or missing work and `browserClosed: true`. The PDF is tagged and embeds four subset fonts. It uses the pre-existing A4 layout and photo downsampling settings. That temporary rehosted cover retained its full native dimensions. Final GF9 covers use the existing stock preset list and normal media pipeline. This historical ingest proof does not establish their final composition or resolution.

## Restart and interrupted work

An ordinary stop and resume retained every origin, the Docker project, snapshot identity, secret file, JWT key and JWKS bytes. The saved Edition 2 HTML and PDF hashes remained identical. Resume did not import, seed, rotate auth material or provision users.

For the interruption test, the supervisor stopped after the publisher served a capture request for Edition 5. B continued answering HTTP 200. A resumed with the same command and completed the fourteen-page PDF and cover through the existing job lifecycle. The completed Edition 3 PDF retained SHA-256 `dd24e45f850b8d2464b097dc295d7df8d77ab18470d283c9155b2660713fb1f9`.

First provisioning now also assigns only snapshot-placeholder-owned assets, Rulesets and Rulebooks to reviewer A. A real local batch pass changed 342 assets, four Rulesets and eight Rulebooks. Existing local owners and immutable Editions retain their identities. The two proof environments predate that launcher addition, so A exercised the guarded local provisioning function separately. New first launches perform it before recording readiness; ordinary ready-state resume never repeats it.

## Guards and automated checks

The two new provisioning functions are internal mutations. Both call the existing server-side isolated-backend guard directly. It requires `IS_TEST=true`, `E2E_LOCAL_AUTH=true`, and both canonical `CONVEX_CLOUD_URL` and `SITE_URL` using HTTP or HTTPS on `localhost`, `127.0.0.1` or `[::1]`. The ownership operation additionally requires exactly one anonymous snapshot placeholder. Hosted URLs and partially enabled test settings refuse before writes. These are application guards; an administrator who deliberately overrides every canonical setting can reconfigure them.

Repeated publisher provisioning preserves pickup choice, leaves the entire settings row identical when revisions match, and enqueues no publication jobs. Ownership tests preserve another local owner's asset and immutable Edition creator and update zero rows on a second pass.

Seven runtime/provisioning suites passed all 45 tests. The full publisher suite passed 532 tests in 45 files. App and publisher typechecks passed, as did focused lint and formatting. The actual Wrangler-resolved simulator test verifies distinct encoded bytes at JPEG qualities 20, 82 and 95, geometry and progressive output. Persistent R2 tests verify restart retention and isolation. Production encoding and acceptance assertions are unchanged.

## Evidence and resuming review

Sanitized evidence lives alongside A's runtime, outside resettable state. `resume-result.json`, `two-environment-isolation.json`, `build-isolation.json`, `ingest-ledger-summary.json` and `interruption.json` record the checks above. `published-reader-focused.png`, `cover-ingested.png`, `cover-edition-3.png`, `edition-3.pdf`, `edition-5.pdf` and `ingested-cover.jpg` provide focused browser and artifact proof. These local files need permanent publication when preparing the PR.

From the integrated checkout, resume A with:

```sh
PATH=/Users/me/.nvm/versions/node/v24.21.0/bin:$PATH bun run app:dev --local --data=snapshot --persist-dir=/Users/me/Projects/Dune/gf9-runtime-proof-a
```

Its state directory is `/Users/me/Projects/Dune/gf9-runtime-proof-a/.dunezone-runtime`. Keep it private because it contains local auth material. B uses the same command with the `gf9-runtime-proof-b` directory. To discard B, run that command with `--reset` only after its supervisor has stopped. Ordinary stop retains its data. Evidence beside `.dunezone-runtime` survives reset.
