# GF9 2.0 working rulebook

[rulebook.json](rulebook.json) is the populated local draft for Dune Zone's JSON Load control. It uses the **Square** preset, the existing illustrated design and production references. It does not contain an importer envelope, local database IDs, owner overrides or publication commands.

This is a first authoring pass, not the finished as-is edition. Read [review.md](review.md) before loading it into production.

## Decisions

- Preserve the reworked transcript's wording, order and uncertainty markers.
- Omit the printed contents and source page 7's physical box inventory.
- Start each detailed faction section on a new page.
- Use existing Blocks and artwork presentations.
- Use Square, as requested on 23 October 2026.
- Allow continuation pages where the existing text size needs them, as approved on 23 October 2026. Source-page anchors and the source map retain the connection to the PDF.

The current draft has 71 output pages and covers all 36 source pages, with the approved omissions recorded. The page count is provisional. It is not a promise to reproduce the PDF's typography or page breaks.

## Files

| File | Purpose |
| --- | --- |
| [rulebook.json](rulebook.json) | Raw `{settings, contents}` document accepted by the application's Rulebook schema. |
| [source-map.json](source-map.json) | Transcript fingerprint, source-to-output page and Block mapping, omissions and editorial notes. |
| [production-references.json](production-references.json) | Public production IDs and compatible faction artwork, captured through read-only public queries. |
| [pagination.json](pagination.json) | Ordered Block partitions for the approved continuation pages. |
| [column-breaks.json](column-breaks.json) | Initial source-page column boundaries, before continuation pagination. |
| [validation.json](validation.json) | Schema, size, source coverage and reference counts from the builder. |
| [render-document.json](render-document.json) | Resolved document used by the real renderer in the local preview. Not the JSON Load input. |
| [build.ts](build.ts) | Rebuilds the initial manuscript from the transcript and recorded layout decisions. It never writes application data. |
| [paginate.ts](paginate.ts) | Groups measured Blocks into columns without changing their order. |
| [preview-server.ts](preview-server.ts) | Local preview server using the production Rulebook renderer, fonts and artwork. |

## Rebuild and preview

From the repository root:

```sh
bun content/gf9-2-0/authoring/build.ts
bun content/gf9-2-0/authoring/preview-server.ts
```

Open [the local preview](http://127.0.0.1:4317/). The page selector supports individual page inspection. The server binds to loopback and serves local generated artwork first. Missing public artwork is read from `https://dune.zone`; no authentication or mutations are involved.

The builder proves that each retained transcript unit is assigned to a Page or Block, and that each formatted-text conversion preserves its visible wording. It also checks the raw JSON size limit, local identities, reference resolution and the publishable render-document contract. These checks do not certify the source transcription or visual fidelity.

The builder overwrites generated JSON. Once manual authoring starts, preserve those changes in the builder or a separate saved copy before rebuilding. Do not overwrite an editor export with an earlier generated draft.

## Production references

The destination ruleset is [GF9 2.0](https://dune.zone/rulesets/gf9-2-0), owned by Central and assigned to GF9. The six referenced faction records currently belong to the older GF9 collection. Use their compatible artwork only. Several names and strengths differ in this edition, so the manuscript carries the new printed text independently and does not import an old faction roster or old card rules.

The maintained Arrakis board and stock artwork IDs resolve through the existing catalogue. No development records must be migrated before JSON Load.

## Load later

1. Finish the fidelity review and retain the final local JSON.
2. Sign in as Central and create or open the intended book under GF9 2.0.
3. Use JSON Load with **rulebook.json**. The application validates the current production references and replaces the editor draft.
4. Inspect the loaded book, then Save. Publish is a separate operation.

Before replacing an existing draft, export it. That export is the recovery copy if a load needs to be reversed. Ownership and the GF9 assignment come from the authenticated application flow and the parent ruleset, not fields in the JSON.
