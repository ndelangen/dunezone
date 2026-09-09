# AssetExplainer authoring prototype

Question: should authors start with an explanation entry, or select a part directly on the illustration?

This throwaway branch supports [#1099](https://github.com/ndelangen/dunezone/issues/1099), part of [#1081](https://github.com/ndelangen/dunezone/issues/1081). It uses the existing Rulebook editor's nested navigation and document preview. The published Block catalogue and database are unchanged.

From this checkout, with dependencies installed, run:

```sh
bun run prototype:asset-explainer
```

Open [the authoring prototype](http://127.0.0.1:6140/iframe.html?id=pages-rulebooks-assetexplainer-prototype--authoring&viewMode=story&variant=A&specimen=board&format=a4).

- `variant=A`: choose an explanation entry, then choose the part it explains.
- `variant=B`: choose a part on the illustration to add or edit its explanation.
- `specimen=board` or `specimen=leader`: separate in-memory drafts.
- `format=a4` or `format=tall`: preview separate specimen books at the agreed sizes.

The bottom arrows switch interactions without replacing either draft. Keyboard arrows also switch when focus is outside a control. Reloading discards edits.

Marker labels default to automatic numbers, starting at 1 and following entry order. Adding, deleting or reordering entries updates numbers in the illustration, legend and explanations together. Custom mode accepts authored numbers, letters or symbols. Switching modes preserves those custom labels.

The Page contains separate Section heading, introductory Text and AssetExplainer Blocks. Select them in the existing Block rail to edit them. AssetExplainer owns its source, explanation entries, marker mode, caption and legend; it has no heading or introduction fields.

Try editing a description, reordering entries, hiding the legend, and adding a placed marker. A placed marker can be positioned by clicking or entering image-relative percentages.

Change the source through the inline picker. Leader selection starts with a faction. Under **Prototype scenarios and draft data**, simulate an updated source, an unavailable named part or an unavailable source. These cases retain the explanation and target identity so an author can repair a reference deliberately.

The board uses maintained territory fragments from the current SVG. Leader artwork comes from the complete Leader token renderer. Leader IDs, named part anchors and source revisions are explicit fixtures. This prototype does not implement live subscriptions, persistence or publication. The source revision control demonstrates the authoring states those features must support.

Review is pending. The prototype does not resolve #1099 until the user responds to the concrete interactions. Record the chosen interaction and any field or accessibility changes there before continuing #1091.
