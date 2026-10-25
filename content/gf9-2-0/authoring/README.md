# GF9 2.0 working rulebook

[rulebook.json](rulebook.json) is the reconstructed manuscript for Dune Zone's JSON Load control. It uses Square, the existing restrained design and production references. The manuscript has 61 pages. Production still contains draft revision 8; the local manuscript now includes the pending board-page correction in [the publication candidate](publication-candidate/README.md). PR #2477 deployed the approved sheet-renderer connection.

The compact overview and three corrected illustrations are documented in [correction/README.md](correction/README.md) and [the clearer scan review](../clearer-scan-review.md). All overview portraits now use published production tokens.

The first audit corrections are saved in revision 8. See [the correction record](easy-fixes-r8.md) for the five changed pages and remaining work.

Read [review.md](review.md) for the visual substitutions and verification. The [earlier fidelity audit](visual-fidelity-audit.md) records the defects in the 71-page baseline; it is retained as historical review evidence.

## Files

| File | Purpose |
| --- | --- |
| [rulebook.json](rulebook.json) | Editable `{settings, contents}` JSON Load document. |
| [source-map.json](source-map.json) | Transcript fingerprint, page and Block mappings, omissions and editorial notes. |
| [composition.json](composition.json) | Illustration replacements made during reconstruction. |
| [resolved-production-references.json](resolved-production-references.json) | Existing faction artwork and component image references for local rendering. |
| [../components/production-cards.json](../components/production-cards.json) | The 15 full production card references and their image revisions. |
| [pagination-rebuilt.json](pagination-rebuilt.json) | Current measured page partitions. |
| [measurements.json](measurements.json) | Block dimensions before pagination. |
| [render-audit.json](render-audit.json) | Measurements and clipping checks for the paginated book. |
| [validation.json](validation.json) | Schema, size, source coverage and reference counts. |
| [render-document.json](render-document.json) | Resolved local authoring preview. This is not the JSON Load input. |
| [reconstruction.md](reconstruction.md) | Source-page guide to the reconstructed pages. |

## Build and inspect

From the repository root:

```sh
bun content/gf9-2-0/authoring/build.ts
bun content/gf9-2-0/authoring/preview-server.ts
```

Open [the local preview](http://127.0.0.1:4317/). The server binds to loopback and reads public production artwork. It does not write application data. Reloading reads the latest render document without restarting the server.

`build.ts` parses the transcript, applies `compose.ts`, splits long prose and applies the current measured pagination. It validates the raw JSON and production references. It never imports or saves records.

After changing a composition, set aside `pagination-rebuilt.json`, rebuild the logical pages, measure them with the read-only function in `measure-dom.js`, and save the results to `measurements.json`. Then run:

```sh
bun content/gf9-2-0/authoring/paginate-rebuilt.ts
bun content/gf9-2-0/authoring/build.ts
```

Inspect the actual renderer again. Measurements alone do not detect a wrong troop count, misplaced caption or inaccurate artwork.

`pagination.json` and `paginate.ts` belong to the earlier baseline audit. The rebuilt manuscript does not use them. `column-breaks.json` supplies the initial source boundaries before the reconstruction overrides them.

## Production

The destination is [GF9 2.0](https://dune.zone/rulesets/gf9-2-0), owned by Central and assigned to GF9. Six new second-edition faction records supply the overview rosters. Older GF9 records remain available for compatible battle and troop artwork. Do not rerun the historical `components/bind-factions.ts` preparation script over the current resolved references.

The reconstruction is saved as draft revision 8 in [the production editor](https://dune.zone/rulesets/gf9-2-0/rulebooks/gf9-2-0-rulebook/edit). `production-draft-export.json` backs up that record, including the cover rendition stored by Save.

Use JSON Load with `rulebook.json` in the normal authenticated editor. Export an existing draft before replacing it. Inspect the result and Save. Publishing an Edition is a separate step. The cover source is the approved artwork already stored on production; the normal save flow can prepare its stored rendition.
