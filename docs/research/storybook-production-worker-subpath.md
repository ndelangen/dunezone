# Storybook at `/__storybook/` in the production Worker

Research for [Prove Storybook can live at /__storybook/ in the production Worker](https://github.com/ndelangen/dunezone/issues/137), performed against commit
[`098a16ce0f8b200795297e7d1dbed179c1fcd09f`](https://github.com/ndelangen/dunezone/tree/098a16ce0f8b200795297e7d1dbed179c1fcd09f)
on 2026-07-27.

## Answer

Yes. The current production Worker can carry the current static Storybook at
`/__storybook/` in the same version with substantial Cloudflare Static Assets
headroom. The viable contract is:

1. Build Storybook as a release-critical step.
2. Copy the complete `storybook-static` tree into the final Worker asset directory
   as `workers/publisher/dist/__storybook`.
3. Keep Storybook files asset-first, but run the Worker first for the two exact
   entry paths:
   - redirect `/__storybook` to `/__storybook/` with `308`;
   - internally serve `/__storybook/index.html` for `/__storybook/`, preserving
     the query string.
4. Keep the application public asset tree at the release root. Current stories
   issue root-absolute `/font`, `/image`, `/generated`, and `/vector` requests.
5. Extend the existing final-asset validation and release smoke to cover the
   combined tree and the Storybook manager/iframe deep link.

The exact entry-path handling is necessary. The current Worker sets
`html_handling` to `none` and `not_found_handling` to
`single-page-application`
([configuration](https://github.com/ndelangen/dunezone/blob/098a16ce0f8b200795297e7d1dbed179c1fcd09f/workers/publisher/wrangler.jsonc#L16-L29)).
In a local Wrangler reproduction, both `/__storybook` and `/__storybook/`
therefore missed an exact file and returned the root Dune Zone `index.html`,
not Storybook. This matches Cloudflare's documented behavior: with HTML handling
disabled, folder URLs depend on `not_found_handling`, and SPA mode serves the root
`/index.html` for an unmatched request
([HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/#disable-html-handling),
[SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)).

Changing global HTML handling would alter the canonical behavior of every HTML
path. The narrower two-path Worker rule leaves application SPA routes and the
existing publisher namespaces unchanged. Cloudflare supports selective
`run_worker_first` path patterns
([Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#assets));
the current Worker already uses this mechanism for publisher and capture paths
and otherwise delegates to `env.ASSETS`
([Worker source](https://github.com/ndelangen/dunezone/blob/098a16ce0f8b200795297e7d1dbed179c1fcd09f/workers/publisher/index.ts#L26-L66)).

## Production-shaped build evidence

Commands:

```bash
bun install --frozen-lockfile
VITE_CONVEX_URL=https://exuberant-finch-263.eu-west-1.convex.cloud \
  bun run publisher:assets
bun run build-storybook
cp -R storybook-static workers/publisher/dist/__storybook
bunx wrangler deploy --dry-run --config workers/publisher/wrangler.jsonc
```

The repository's production release currently builds the application and
isolated capture bundle, assembles them into `workers/publisher/dist`, validates
that final tree, then performs a Wrangler dry run before deploy
([scripts](https://github.com/ndelangen/dunezone/blob/098a16ce0f8b200795297e7d1dbed179c1fcd09f/package.json#L23-L35),
[deployment workflow](https://github.com/ndelangen/dunezone/blob/098a16ce0f8b200795297e7d1dbed179c1fcd09f/.github/workflows/deploy-main.yml#L63-L99)).
The Storybook build is a static build, which Storybook documents as deployable to
any static web host
([Publish Storybook](https://storybook.js.org/docs/sharing/publish-storybook)).

Measured uncompressed filesystem results:

| Asset tree | Files | Total bytes | Largest file |
| --- | ---: | ---: | --- |
| Current production Worker assets | 1,076 | 120,550,276 | `image/card/head-shade.png`, 4,555,842 bytes |
| Current Storybook static build | 1,118 | 127,016,234 | `image/card/head-shade.png`, 4,555,842 bytes |
| Combined release | 2,194 | 247,566,510 | `image/card/head-shade.png`, 4,555,842 bytes |

Cloudflare currently allows 20,000 static asset files per Worker version on the
Free plan, 100,000 on Paid, and 25 MiB per individual file on both
([Workers limits](https://developers.cloudflare.com/workers/platform/limits/#static-assets)).
The measured combined release therefore has:

- 17,806 files of Free-plan headroom (2,194 of 20,000 used);
- 97,806 files of Paid-plan headroom (2,194 of 100,000 used);
- 21,658,558 bytes of per-file headroom
  (`26,214,400 - 4,555,842`).

No total uncompressed-byte limit is documented for a Worker asset collection.
The combined Wrangler 4.111.0 dry run succeeded. Wrangler reported reading 2,252
filesystem entries, which is the 2,194 files plus 58 subdirectories below the
asset root; the Cloudflare limit and the repository validator count files.

The existing validator already rejects symbolic links, more than 20,000 files,
and files larger than 25 MiB
([asset inspection](https://github.com/ndelangen/dunezone/blob/098a16ce0f8b200795297e7d1dbed179c1fcd09f/scripts/lib/publisher-assets.ts#L13-L92)).
It must run *after* Storybook is copied so those checks cover the release that
Wrangler actually uploads.

## URL and browser proof

The generated Storybook manager and iframe entrypoints use subpath-safe relative
URLs:

- `index.html` links `./favicon.svg`, `./sb-manager/runtime.js`, and
  `./sb-addons/...`;
- `iframe.html` links `./vite-inject-mocker-entry.js` and `./assets/...`.

With the narrow redirect/rewrite proof in front of the exact combined asset tree:

- `GET /__storybook` returned `308` to `/__storybook/`;
- `GET /__storybook/?path=/story/application-factions-factioncard--default`
  served byte-for-byte the generated Storybook `index.html`;
- the Storybook manager created
  `/__storybook/iframe.html?id=application-factions-factioncard--default&viewMode=story`;
- the iframe story root became visible;
- the manager deep link survived a full reload;
- a direct `iframe.html?id=...&viewMode=story` navigation rendered;
- Playwright observed no failed requests or HTTP responses of 400 or greater.

A second game-card story proved the static-asset exception. Its Storybook manager,
iframe, bundles, and metadata all loaded below `/__storybook/`, while its artwork
and fonts loaded successfully from these release-root paths:

```text
/font/...
/generated/...
/image/...
/vector/...
```

That behavior follows the current Storybook configuration, which copies `public`
through `staticDirs`
([Storybook configuration](https://github.com/ndelangen/dunezone/blob/098a16ce0f8b200795297e7d1dbed179c1fcd09f/.storybook/main.ts#L75-L88)),
and current compiled story code, which contains root-absolute public paths.
Storybook's own subpath guidance says static media must use relative paths (or a
base element) unless imported
([Storybook assets](https://storybook.js.org/docs/configure/integration/images-and-assets#absolute-versus-relative-paths)).
Here those absolute requests are intentionally satisfied by the same atomic
Worker release's root public tree. The implementation contract must preserve and
smoke that co-location dependency; a future independent Storybook host would need
an asset-path migration.

## Collision analysis

There is no filesystem collision in the measured release:

- the current assembled Worker has no `__storybook/` prefix;
- Storybook is nested wholly beneath that new prefix;
- 897 Storybook files are byte-identical to files already present at the release
  root, but their prefixed paths remain distinct.

There is one routing collision today: the root SPA fallback owns the two
Storybook entry URLs because neither is an exact asset when HTML handling is
disabled. The exact-path Worker rule resolves only that collision.

The proof then rechecked:

| Request | Result |
| --- | --- |
| `/`, `/privacy`, `/factions/example` | Existing root SPA shell, `200` |
| `/__asset-publisher/health` | Existing JSON health response, `200` |
| `/__asset-publisher/not-real` | Existing reserved JSON `404` |
| `/published/not-real` | Existing public-delivery `404` |
| `/publisher-capture`, `/publisher-capture.html` without credentials | Existing reserved JSON `404` |

Do not reserve the whole `/__storybook/*` namespace Worker-first merely to fix
the entrypoint. Storybook's hashed bundles, manager metadata, and iframe are
ordinary static assets and should remain asset-first. Only `/__storybook` and
`/__storybook/` require Worker handling under the current global HTML policy.

## Required implementation and verification constraints

- `build-storybook` must fail the release before deployment on any build error.
- Assembly must copy the complete successful output to
  `workers/publisher/dist/__storybook` before final validation and dry run.
- Assembly must start from clean build outputs and reject a pre-existing or
  conflicting `__storybook` destination.
- Final validation must require at least:
  `__storybook/index.html`, `__storybook/iframe.html`, and
  `__storybook/index.json`, and must count Storybook in the existing file-count
  and per-file limits.
- Add exact `run_worker_first` entries for `/__storybook` and `/__storybook/`.
  Preserve query strings across the redirect and internal rewrite.
- Keep `/__storybook/*` asset-first and keep all existing publisher/capture
  Worker-first paths intact.
- Release smoke must assert:
  1. `308` from `/__storybook` to `/__storybook/`;
  2. Storybook, not the Dune Zone shell, at `/__storybook/`;
  3. one real manager query deep link;
  4. its iframe and representative hashed assets;
  5. one representative root-absolute story asset;
  6. existing Worker health and root SPA behavior.
- Keep the root `public` asset tree in the same atomic release until current
  root-absolute story asset references are migrated.

These constraints establish hosting viability only. They do not certify that
every published story is fixture-only and safe for unauthenticated public use;
that remains the separate public-story safety audit in the Wayfinder map.
