# Content import and export

Open `/imports` while signed in. Select an existing Ruleset and its Group by slug, paste a package or select a JSON file, then preview it. The preview names the target, signed-in owner and each record to create or update. Import writes one item at a time in package order. Each item's content, Group assignment, links and import receipt commit together. A failed item rolls back; earlier successful items remain.

New factions and assets belong to the signed-in account. All imported factions and assets go into the selected Group. Rulebooks belong to the selected Ruleset, which must already belong to that Group. Existing ownership stays with its current account. The importer uses the same permissions, validators and publication work as the editors. It accepts no account ID or administrative identity.

A new Rulebook receives the complete imported content as Edition 1. Updating a Rulebook saves and publishes the new content as its next Edition. Faction and asset changes become live when their writes complete; derived images and PDFs finish afterward. Import reviewed content, and check publication readiness before treating delivery as complete.

## Package format

The envelope is versioned. Payloads use the existing write contracts rather than raw database rows.

```json
{
  "format": "dunezone-package",
  "version": 1,
  "packageKey": "gf9",
  "items": []
}
```

`packageKey` identifies the authored package within a target Ruleset. Each item has its own stable `key`. Keys use lowercase letters, digits and single hyphens. A package contains 1 to 500 items. Keep those identities when correcting content so a retry updates the intended records.

Each item has one of these shapes. The examples below describe payload fields; use a real exported or schema-validated object in place of the illustrative empty objects.

```json
{
  "key": "atreides",
  "kind": "faction",
  "data": {},
  "link": true
}
```

A faction's `data` follows [`FactionWriteSchema`](../src/shared/factions/schema.ts). `link: true` also adds it to the Ruleset. Its member and troop IDs remain stable across edits.

```json
{
  "key": "nexus-deck",
  "kind": "asset",
  "type": "deck",
  "data": {},
  "members": [{ "key": "nexus-atreides", "count": 1 }],
  "slot": "custom"
}
```

An asset's `type` comes from the [asset registry](../src/shared/assets/types.ts). `data` follows that type's [write schema](../src/shared/assets/validation.ts). Decks and bundles may specify `members`; each member names an earlier package item and a count from 1 to 99. Supplying `members` replaces that container's membership with the listed counts. Omitting it preserves existing membership. A member appears once, with its quantity in `count`.

`slot` also installs the asset in a Ruleset slot. The slots are `board`, `treachery`, `spice`, `custom`, `techToken` and `customTokens`. Their accepted types and single/multiple behavior come from the [slot registry](../src/shared/rulesets/assetSlots.ts). Group membership and Ruleset installation are separate associations.

```json
{
  "key": "base-rules",
  "kind": "rulebook",
  "data": {
    "name": "GF9 base rules",
    "settings": { "size": "a4", "design": "illustrated" },
    "contents": {
      "schemaVersion": 1,
      "pageOrder": ["RULE"],
      "pagesById": {
        "RULE": {
          "id": "RULE",
          "anchor": "introduction",
          "title": "Introduction",
          "layoutId": "single-column",
          "showHeading": true,
          "controlValues": {},
          "blockOrderByRegion": { "content": ["TEXT"] },
          "blocksById": {
            "TEXT": {
              "id": "TEXT",
              "kind": "text",
              "text": "The rules begin here."
            }
          }
        }
      }
    }
  }
}
```

Rulebooks use the existing [contents](../src/shared/rulebooks/contents.ts) and [settings](../src/shared/rulebooks/settings.ts) contracts. Imported books contain 1 to 100 Pages so the publisher can capture their PDFs. Existing books retain their names, size, design and surviving Page layouts. Rename through the editor; use a new book when changing its size or design. Existing Edition history stays immutable.

## References between items

Local and production database IDs differ. Declare explicit bindings for fields that name another package item. A binding's path starts inside the item's `data`, and its `field` is either the dependency's `id` or `slug`.

```json
{
  "key": "nexus-atreides",
  "kind": "asset",
  "type": "card-nexus",
  "data": {
    "factionLink": { "id": "replace-me", "slug": "replace-me" }
  },
  "bindings": [
    { "path": ["factionLink", "id"], "key": "atreides", "field": "id" },
    { "path": ["factionLink", "slug"], "key": "atreides", "field": "slug" }
  ]
}
```

This fragment illustrates the bindings only; the card still needs every required Nexus field. The importer rewrites those two fields and leaves other strings alone. Put `atreides` before this card. The same mechanism handles faction references in Rulebook blocks, saved board and token IDs, card backs, and faction extras that refer to asset slugs. Stock artwork keeps its catalogue path and needs no binding.

Bindings must point to existing fields. Dependency cycles and forward references fail package validation. Do not paste local database IDs into a production package without replacing their references.

## Existing records and safe retries

To reuse an existing record, add `"existing": { "slug": "current-slug" }` to that item. For assets, `type` plus slug identifies the record. A Rulebook's slug is scoped to the selected Ruleset. The preview checks access and records the current state hash. For a single-asset Ruleset slot, it also names the asset being replaced and records that association. An import refuses if the record or slot changed after that preview. A package may fill each single-asset slot once.

After success, a receipt connects the Ruleset, package key and item key to the created or adopted record. Retrying unchanged content reuses it. A changed package updates the same record after another preview. A record edited independently since its last import becomes a conflict, so the importer cannot silently erase someone else's work. Export it and reconcile that work before choosing how to proceed. Changing an item's kind is refused.

To reconcile a conflict, export the current record and review its changes alongside the authored package. Copy the reviewed data into the original item, retaining its original package key and item key, and copy the export's `expectedStateHash` onto that item. This field names the exact current record state you reviewed. Preview the corrected package and import it. The importer permits reconciliation only while both that field and the new preview still match the current state. Another edit invalidates the review. Exporting alone never modifies the record.

If a later item fails, correct the file and preview again. Earlier completed items remain available through their receipts. Do not change package or item keys just to retry; doing so requests new records unless `existing` names a reviewed target.

## Export

The export form downloads a one-item package for a faction, Rulebook saved draft or asset, including its `expectedStateHash` for reviewed reconciliation. It includes authoring data and Rulebook settings; ownership, database row metadata and publication jobs stay out of the payload. Database references remain tied to the source deployment. The form shows warnings when bindings or container members need adding before moving the export elsewhere.

A portable package must include its dependencies and explicit bindings. Exporting a deck's data alone does not export all its cards. The current export is a starting point for authored packages, not a database backup or a whole-Ruleset snapshot.
