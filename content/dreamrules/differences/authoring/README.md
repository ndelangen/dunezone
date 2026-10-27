# Dreamrules differences authoring

Edit [manuscript.json](manuscript.json), then run `bun content/dreamrules/differences/authoring/build.ts` from the repository root. Update [../change-index.json](../change-index.json) when adding or removing a topic.

The build generates these files:

- `rulebook.json`, the native JSON Load document with A4 settings.
- `render-document.json`, the resolved input to the existing rulebook renderer.
- `pages.json`, the page number, title, anchor and local ID list.
- `coverage.json`, the source topics mapped to page and block IDs.

The build checks the raw schema, references, JSON round trip, render projection diagnostics and topic coverage. IDs are deterministic from the page and block keys.

Run `bun content/dreamrules/differences/authoring/preview-server.ts` to serve the draft at <http://127.0.0.1:4321/>. The preview uses production's existing renderer and public asset URLs. It makes no application data writes. Reload after rebuilding the manuscript. Restart the server after changing the preview code.

## Verification

The 27 October 2026 review checked all 31 rendered pages for runtime errors, missing images and content extending outside its page or block. `render-checks.json` contains the measurements. The PDF has 31 tagged A4 pages; `pdf-checks.json` records its hash and the checks on 180 prose fields. Table contents received separate visual review.

After editing, check the affected pages in the preview and export the PDF again. Recheck both the rendered pages and extracted PDF text before sharing the result. The reports describe the saved version and must not be treated as verification of later edits.

The JSON file is ready for local review. Import and publication remain separate actions.
