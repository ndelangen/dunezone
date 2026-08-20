# Rulebook conflict prototype

This throwaway browser route asks whether concurrent-edit conflicts can fit inside the rulebook editor without turning the page preview into a diff tool.

It uses in-memory data only. Nothing reaches Convex or survives a reload.

Run it from the repository root:

```sh
bun run prototype:rulebook-conflicts
```

Then open:

```text
http://localhost:4173/rulesets/rulebook-conflicts-prototype?variant=inspector
```

The route contains three structural variants:

- `inspector`: page rail, contained page preview, and persistent side controls.
- `focus`: horizontal page navigation with a larger preview.
- `compare`: the local draft beside the latest saved revision during review.

Use a scenario button to create an incompatible change. Save becomes Review differences. The comparison opens on the same route and Save returns only after every difference has a choice.

## Known shortcut

The reducer still refuses new local operations while differences need review. The human review rejected that as product behavior. Production must allow further editing, add newly incompatible operations to the same review, and block only Save. Preserve this shortcut only as evidence of where the throwaway prototype stopped.
