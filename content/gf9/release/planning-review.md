# Production-batch contract review

This reviews the release plan, not completed implementation or production content.

The user's live answer selected normal immediate publication, one book at a time. Each new current web Edition is verified before publishing the next book. Brief background preparation is permitted and older Editions remain available.

An independent source review checked authenticated publication/retry behavior. Asset Save can re-enqueue unchanged approved content. Faction Save selectively skips unchanged component faces, so it cannot retry every image. Rulebook Retry preview covers only the first-page image. Failed Edition HTML/PDF work has no general authenticated reset promised by the current application. The contract records these limits rather than inventing a recovery control or administrative repair.

Independent reviewers found three drafting defects, now corrected:

- The complete-book approval gate applies to production book preparation and batch two. Batch one may finish while the user reviews the books.
- Publish identifies the Edition through the verified Rulebook ID and returned Edition number. It does not promise to return an Edition row ID.
- Brief preparation can overlap the next verified book, but final completion requires the correct required background outputs ready and retrieved. An explained pending state is still incomplete.

Final publication review confirmed these corrections. A separate consistency review found no additional actionable conflict with the resolved authoring, component and acceptance contracts. It also checked that normal clean Asset Save remains available in the current UI, so the unchanged-data retry is usable.

Reviewed production-batches.md SHA-256: `4a709cf083bcd7d9368f4771d632f7e8617d52502ad54db8e01f56ee21beb3f8`.

The acceptance contract received only links to the new batch contract. No application code, production data or accepted artwork changed. Implementation still must prove the existing gates and record the actual production bindings and operations before execution.
