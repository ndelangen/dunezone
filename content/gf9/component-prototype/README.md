# GF9 component treatment prototype

Throwaway review code for [Approve faction, logo and component correction treatments](https://github.com/ndelangen/dunezone/issues/2362). This is a read-only renderer comparison, not the working local application required by the implementation map. It has no Convex connection and makes no content writes.

Run from the repository root:

```sh
bun content/gf9/component-prototype/serve.ts
```

Open http://127.0.0.1:39612/?case=labels for the active correction. Other cases are `art`, `headers` and `factions`. Accepted covers and book compositions live in their separate prototype and do not need reapproval here.

## Accepted decisions

- Use both wider verified original faction-head crops. Preserve their native source resolution and provenance.
- CHOAM alone has the red upper and black lower textured gradient. Its shared logo remains intentionally empty. Richese retains its uniform grey background.
- Use the genuine Gale Force Nine mark centered on the shown dark square for the existing Ruleset image.
- Fit complete card titles on one line through one shared UI responsibility. Never wrap, truncate, clip, abbreviate or cap a title. All card types must consume the shared behavior in production, including backs through an SVG adapter. Preserve established typography and icon clearance.
- Restore complete supporting-leader names and full Spice territory names. Remove the literal `GF9 ` prefix from visible text on every associated asset. Internal keys and permanent identities retain their namespace.
- Keep the visible Bene Gesserit flip connector and complete Ecaz/Vidal advantages. Short token labels may have full names and effects beside their book illustrations.
- Discovery tokens use one central vector with a radial textured background and clear outline. Omit the original small effect icons and numbers. Explain their effects in the rulebook. Do not add token composition layers for those decorations.
- Karama uses the later CHOAM & Richese replacement. The active deck has two corrected copies, with a separate Richese cache member. Do not display obsolete base copies as current cards.

Each live decision is recorded on the issue. Text and sheet acceptance does not approve the rejected card/token artwork.

## Corrected preview bugs and evidence

The server now serves generated normalized public vectors, falling back to maintained public production assets. Serving raw `media/vector` files had drawn only a sliver of the map in Spice cards. The renderer itself correctly expects the normalized map.

`PrototypeCardTitle` is shared by accepted Header A and the card examples. It measures the actual loaded Copperplate font, preserves the full name and reserves icon clearance. This throwaway overlay proves the treatment. The production implementation must migrate every title consumer, remove duplicate heuristics and integrate settlement into existing publication readiness. It must not ship these hiding/overlay selectors.

`bun content/gf9/component-prototype/verify-corrections.ts` checks the corrected map contract, sample title identity, single-line fitting, missing images and runtime failures. It writes ignored evidence under `output/`. `inspect.ts` covers eight review routes. `export.ts` creates an actual-size PDF, but earlier exports include rejected artwork and are not accepted final proof.

## Still open

The component artwork is not accepted. The source comparison contains genuine extracted Tech and Discovery tokens, Hidden Mobile Stronghold, Shield Wall and Kwisatz Haderach pieces. The manifest records exact PDFs, pages, resolutions and hashes. Existing-control samples show how far data corrections get and where fixed token composition falls short.

The user rejected extra effect markers and chose one central vector, so the broader token composition proposal is unnecessary for these pieces. Existing gradients can reproduce the radial center/rim treatment. Dark fill and thicker outlines are supported by renderer props but are not in the stored TokenFace or editor. The implementation must expose and persist those optional style values, preserve existing defaults and thread them through preview and publication. The local example only proves the appearance. No schema or renderer capability has been implemented.

Karama and the Discovery Spice examples still need source-led body/artwork correction. A verified current replacement Karama face was not found in the supplied PDFs. Do not use old Avalon-style scans as GF9 originals. The current long-form Karama rules need a concise, accurate face; its existing merged overbidding/free-purchase sentence is insufficient. Record source limitations instead of inventing provenance.

The scope of shared title work and regression evidence is in [shared-card-title-contract.md](shared-card-title-contract.md). The other investigation files are dated read-only findings. Their description of the original unchanged label panel precedes the local map, title and source-comparison corrections.

## Publication and delivery

No production renderer or application record has changed. This branch is evidence for the planning issue, outside main. Later implementation needs normal authenticated local and production flows, appropriate renderer revisions, publication recapture, required CI and separate Astra High code and architecture reviews at the final PR head.
