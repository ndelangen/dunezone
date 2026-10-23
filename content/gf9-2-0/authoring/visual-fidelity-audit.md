# Visual comparison with the source rulebook

Reviewed 23 October 2026. This is a repair assessment of the first local draft, not a claim that the repairs are finished.

## Evidence and scope

I rendered all 36 pages of [the supplied PDF](../source.pdf), captured all 71 pages of the local browser draft, and compared their compositions. I also inspected the authored JSON, builder, renderer and reference bindings. Source page numbers below count the cover as page 1. Draft numbers refer to the captured 71-page baseline and will change during repair.

- Source PDF SHA-256: `0d8a3a0bc504596199fe2fc8dcc600e6dba1c627649db057959245a42d89566a`.
- Captured `rulebook.json` SHA-256: `d2406c58e73e539c4a57633f7659df6ce97d1619067db6e231300d39bc3df964`.
- Captures: `/tmp/gf9-visual-audit/source/` and `/tmp/gf9-visual-audit/draft/`. Selected comparisons are retained in the task's `output/audit/` folder.
- The comparison concerns illustration coverage, grouping, reading order and page composition. It does not certify every OCR reading or a newly exported PDF.

The draft is substantially incomplete as a visual reconstruction. All 71 pages use `two-columns`. Its 394 Blocks include 259 text Blocks, 59 section headings, 27 lists, 15 card entries, 10 credits, eight Q&A, six callouts, five battle plans, three board scenes, one asset explainer and one piece transfer. It has no faction introductions, referenced illustrations, card groups or battle comparisons. Many descriptions of illustrations have become visible body text instead of illustrations.

The previous render check established that images loaded and the measured regions did not overflow vertically. It did not establish visual fidelity. Draft page 49 visibly clips pieces and the second wheel horizontally inside a Block. Some text also reaches the decorative footer art. Those are defects even though the earlier report passed.

## Decisions recovered from the earlier review

These remain settled. They are recorded in [the original block audit](../block-audit.md) and separate comments on [issue #2431](https://github.com/ndelangen/dunezone/issues/2431).

- Reuse existing Blocks, artwork, layouts, normal headings and page-number placement. Do not ask again for each reuse decision.
- Omit the printed contents on source page 2 and the entire physical inventory on source page 7. Preserve the preface and quotation.
- Use the existing board with `asset-explainer` markers and a legend. Reproduce the meaning of map examples with `board-scene`, not the photographed board style.
- Use the existing battle wheel, battle Blocks and piece groups. Preserve forces, leaders, cards, spice and outcomes. Explain differences in the wheel's spice display with adjacent text.
- Use existing Q&A and callouts, including the two Karama extracts.
- Start each detailed faction on a new page. Finish Bene Gesserit before Fremen. Square pages and necessary continuation pages are approved.
- Karama 2.0, dune ridgelines, Little Maker and Solaris additions are approved. Little Maker and Solaris have approved multicolour variants. Reuse these assets.
- The later cover decision replaces the original audit's baked-in-lettering proposal. Use the approved clean background with existing text and logo overlays. The preset release is tracked in [PR #2464](https://github.com/ndelangen/dunezone/pull/2464).

No new Block or layout is established as necessary by this comparison. Missing authoring and unresolved content references must be repaired before treating anything as a software gap.

## Corrections from the six browser comments

1. **Preface quotation.** Move the quotation from draft page 3 into the right column of the preface on draft page 2, below its prose, if the complete Block fits. The capture shows substantial available room. Measure the final arrangement, then remove the empty continuation.
2. **Subheadings.** Use sentence case, including credit labels such as "Original rules" and "Development & second edition". Keep names and acronyms intact. Some section headings are uppercased by renderer CSS; changing authored case alone does not fix those. Prefer ordinary existing text headings for small labels and check the rendered result.
3. **Excessive bold.** Long play-testing and thank-you paragraphs should be regular weight. The current credits renderer wraps every contributor name in `strong`, and the builder puts entire paragraphs in that name field. Compose long acknowledgements with existing text Blocks; reserve emphasis for a phrase or at most one sentence in a paragraph. Review other full-paragraph emphasis against the PDF.
4. **Continuation titles.** Remove invented visible "continued" page titles. Retain useful navigation labels and source mappings separately. Hide repeated page headings on genuine continuation pages using `showHeading: false`.
5. **Credits boundary.** Start Credits on the next page, with its heading and the Original rules group together. Do not leave the first group under Notes while the remaining credits start a page later. This user correction takes precedence over copying the source page's shared Notes/Credits composition.
6. **Faction overview.** Restore the illustrated faction panels. "Portrait: Duke Leto Atreides" and a bulleted roster are transcription descriptions, not a replacement for the source's faction token, ruler portrait and five leader discs. Keep a faction and its roster together.

These corrections are recorded requirements. The screenshots used for this audit intentionally retain the faulty baseline.

## Page-by-page repair plan

| PDF page | Draft pages | What the source contains and what must change |
| --- | --- | --- |
| 1 | 1 | Illustrated cover. The draft is a plain list of cover words. Apply the approved clean cover preset and the existing Dune/title/subtitle overlays after its release. Check crop and readability on Square. |
| 2 | 2–3 | Preface, margin quotation and printed contents. Keep the approved contents omission. Bring the quotation back with the preface, using the right column if it fits. Remove the otherwise empty continuation. |
| 3 | 4–5 | Notes, expansion note, grouped credits and legal/logo material. Preserve the expansion note as a note. Start all Credits on their own next page per the new comment. Use sentence-case labels and regular-weight acknowledgements. Keep legal text separate. Reuse available publisher/studio marks only after checking their identity. |
| 4 | 6–7 | Four illustrated rows: Atreides, Bene Gesserit, Emperor and Fremen. Each has a faction token, summary, ruler and five leaders. Use `faction-introduction` in a full-width arrangement with edition-correct faction references. The current text lists omit all portraits and split Bene Gesserit from its roster. |
| 5 | 8–9 | Guild and Harkonnen illustrated rows, followed by Object of the Game. Restore both rows, then begin the objective below them or on the following page if needed. Use an existing band/column layout. Do not call the objective a continuation of Faction overview. |
| 6 | 10–11 | Large labelled board and battle-wheel assembly illustration. The current explainer has four broken targets and a tiny map; the other eight labels are a list on another page. Bind all 12 labels to the chosen board source with valid geometry/points. Keep a readable legend nearby. Show a revealed existing wheel with its assembly prose. Concealed battle sides currently show faction tokens instead. |
| 7 | none | Physical box inventory. Omitted by approval; no illustration work required online. |
| 8 | 12–13 | Setup text, margin quotation and labelled Atreides sheet header. The header is currently transcribed prose. Recreate it with the existing faction-sheet presentation or a maintained illustration source, and use `asset-explainer` for deployment, starting cards and starting spice. Keep the quote as a callout. |
| 9 | 14–15 | Nine phases with their icons and short descriptions, plus the turn-order symbol. Add existing phase icons and keep each phase together. A lone Mentat Pause paragraph should not occupy a new page when a measured composition fits. Preserve printed references unless separately revised. |
| 10 | 16–17 | Storm rules, margin quote and two storm examples. Both actual diagrams are absent. Add two cropped `board-scene` examples with storm position, affected sectors, named territories, troop positions and the existing captions. Descriptions of map lettering belong in review notes or on the actual map. |
| 11 | 18–19 | Hagga Basin/Cielago Depression example card, plus Great Flat/Cielago South, Shai-Hulud and Little Maker cards. Current entries show isolated decals, and the main spice example is text only. Add full card sources through existing card renderers/references. Preserve both spice territories and amounts, captions and the storm qualification. |
| 12 | 20–21 | Short CHOAM section above Bidding, with a Bene Gesserit note. Use existing section headings and a band/column arrangement. Continue Bidding without repeating CHOAM as the page title. Keep subsections and their lists together. |
| 13 | 22–23 | Revival rules above a large Atreides sheet extract, with a pointer to free revival and its explanation. The entire extract is currently body prose. Add the actual sheet presentation and `asset-explainer` marker for its free-revival value. Keep the explanation adjacent; avoid repeating the whole sheet as ordinary rules. |
| 14 | 24–25 | Shipment/movement rules and an ornithopter illustration covering Carthag and Arrakeen. The illustration is absent. Add a cropped maintained board scene with the two access locations and their source caption. Preserve the relationship between the example and the movement rule. |
| 15 | 26 | Two Harkonnen before/after examples and a tall Guild example. Two plain full-board route views are insufficient. Show 4 forces at Carthag, shipment of 5, then movement of 3 to Arrakeen leaving 6. Preserve the other factions, storm restriction, Guild shipment and movement, destination and spice markers in the Guild example. Use multiple scenes and existing piece movement as needed. |
| 16 | 27–28 | Battle rules and a margin quotation. Mostly text in the source. Keep paragraph emphasis and list nesting, move the quotation to a deliberate callout/rail position, and avoid detaching Battle Plan from its introduction. |
| 17 | 29–30 | Battle rules, the 6-force/4-spice example wheel, a note about information leakage, and full Lasgun/Shield cards. The wheel is absent; cards are decals beside transcript text. Add a battle step with the approved existing wheel and a +2 explanation, full card sources and the note. Remove editorial wheel-lettering prose from the reading copy. |
| 18 | 31–32 | Result rules and the Emperor half of the worked battle. Current wheels have no attached cards, no troop groups and an empty opposing plan. Put Hasimir Fenring, dial 6, spice 4, Baliset and Snooper into the existing battle composition. Show total 14 in the source explanation. Keep this stage before the response/result on page 19. |
| 19 | 33–34 | Traitor rules and the matching Atreides plan/result. Attach Lady Jessica, dial 4, no spice and Maula Pistol, with no defense. Retain the 9 versus 14 outcome, Hasimir's death, spice reward, force losses and card disposal/retention as printed. Use the existing comparison/step presentation; do not add cards that are absent. |
| 20 | 35–36 | Collection, a three-stronghold illustration with Carryalls/Stronghold Income labels, then Mentat Pause. The draft has a distant full-board highlight and separate prose labels. Crop to the three strongholds, add the labelled locations and keep the illustration in the collection section before Mentat Pause. |
| 21 | 37–38 | Alliances prose, including an introductory italic passage. No major new artwork is required. Restore source emphasis and grouping; avoid a mostly empty continuation and redundant title where the complete section fits. |
| 22 | 39–40 | Other Rules prose with named lead-ins, nested bullets and italic examples. No major new artwork is required. Check paragraph/list boundaries and emphasis instead of adding illustrations. |
| 23 | 41–42 | Crysknife/Snooper pair, Tleilaxu Ghola and Kulon with associated explanations. Replace decal-only entries with full edition-correct cards; use `card-group` or adjacent entries to preserve pairing. A lone Kulon entry should stay with Worthless cards rather than occupy a new page by itself. |
| 24 | 43–44 | Destroyed Shield Wall board example with Family Atomics, and faction Karama cancellations with the new Karama card. The board scene is absent. Add its crop/destruction marker and full cards. Keep Family Atomics tied to its diagram and Karama tied to the cancellation list. |
| 25 | 45–46 | Named insights plus the new Solaris card. The approved coins appear, but they are not a complete card. Use the full card with its exact three options and existing multicolour artwork. Keep its explanatory paragraph nearby. |
| 26 | 47–49 | Three half-dial examples, two alternative force-loss diagrams, Fremen Battle Edge text and two Karama callouts. The draft clips pieces and the second wheel on page 49; it uses the same ordinary troop silhouette for Sardaukar and omits the supporting spice. Put examples next to their explanations in a wide enough existing region. Use distinct troop artwork and the 1-spice marker. Keep 2½, 4½ and the printed 8½ caption. Remove the unused concealed opponent token and generated "None" leader labels where a standalone illustration is intended. |
| 27 | 50–51 | Bene Gesserit rules, emblem, strategy rail and advisor token. The strategy is ordinary column prose and the token is only a caption. Use `outer-rail` for strategy with the existing emblem and a real advisor-face source beside its rule. Preserve the initial Factions sentence. |
| 28 | 52–53 | Bene Gesserit fighter face, alliance and Q&A, then the beginning of Fremen. Restore the fighter token. Existing Q&A is the approved presentation. Retain the approved fresh page before Fremen; its opening should have a clear faction title. |
| 29 | 54–55 | Fremen continuation, normal/Fedaykin tokens, emblem and strategy rail, alliance/victory/Q&A. Restore both distinct force tokens and the strategy rail. Keep the continuation with the opening Fremen section in reading order without a redundant heading. |
| 30 | 56–57 | Emperor with emblem/strategy rail and ordinary/Sardaukar tokens. Restore both tokens and the rail. Keep named powers and alliance/insight groups intact; source card names are text references, not a reason to insert extra cards. |
| 31 | 58–59 | Atreides with emblem and strategy rail. Restore the rail instead of moving strategy to the tail of the rules. The small hand at the lower photograph edge is not authored rulebook artwork to reproduce. Keep the source's intentional space where useful. |
| 32 | 60–61 | Harkonnen with emblem and strategy rail. Restore that arrangement using existing tools. Check dense capture/traitor paragraphs, nested exceptions and alliance boundary. Do not generate an unrelated roster in the detailed rules. |
| 33 | 62–63 | Guild with emblem and strategy rail, distinct special-victory/alliance bands and two Q&A. Restore the rail and grouping. Keep the approved Q&A presentation and exact victory examples. |
| 34 | 64–66 | Synopsis, mainly two-column prose. No missing major artwork. Retain paragraphs and source order; rebalance after removing unnecessary repeated headings. Do not shrink text simply to force the old scan's density. |
| 35 | 67–69 | Synopsis continues without a new source heading. Remove the invented repeated title and continuation banners. Maintain continuity from page 34 and check paragraph splits. No added artwork is needed. |
| 36 | 70–71 | Terminology with a margin note and bold term lead-ins. Use the existing rail plus text presentation, restore term emphasis, and keep each definition together. No glossary/table feature is needed. |

## Reference work needed before import

The new decals solve illustration ingredients. They do not create full card or faction records. The current binding file contains six older factions for emblems/tokens only, with no ruler/leader roster supplied to the projection and no resolved asset records. Do not substitute the old edition's data simply because its artwork loads.

1. **Six faction panels.** Bind or author six edition-correct faction values with six ruler portraits and 30 leader discs. Reuse compatible stock portraits and existing renderers. Verify each displayed name/strength, notably Duncan Idaho at 3. A `faction-introduction` takes one faction ID and derives its roster; it has no independent per-Block roster override. The normal solution is correct 2.0 faction content, not a new Block.
2. **Fifteen distinct illustrated cards.** Two Spice Blows cards, Hagga Basin/Cielago Depression and Great Flat/Cielago South; Shai-Hulud; Little Maker; Lasgun; Shield; Baliset; Snooper; Maula Pistol; Crysknife; Tleilaxu Ghola; Kulon; Family Atomics; Karama; Solaris. The current 15 entries represent 14 distinct card names because Snooper appears twice, and the Hagga example is only text. Bind verified existing 2.0-compatible records or author the missing values. The saved Karama JSON is a local draft, not an application reference. Battle slots and `card-group` require card asset IDs; a stock decal is not a card ID.
3. **Faction sheet examples.** Recreate the Atreides header on page 8 and the sheet/free-revival example on page 13 with second-edition values. Use the existing sheet renderer and maintained illustration/reference path. Do not publish its transcription descriptions as substitute prose.
4. **Token faces and markers.** Bind normal Emperor/Sardaukar, normal Fremen/Fedaykin, Bene Gesserit advisor/fighter, spice and destroyed Shield Wall sources. Use the existing token/stock presentation. Verify faces, counts and support in each example.
5. **Board state.** Author actual storm sectors, crops, routes, troops, spice locations, destroyed-wall state and annotation targets. These are missing scene data, not missing bitmap artwork. The current map-only scenes have empty troop/player arrays. Page 6's four targets also lack the matching source identity required by the existing annotation contract. The maintained board geometry must be checked for every chosen marker; use existing positioned targets where appropriate.
6. **Credits marks.** Check the Museum of Science Fiction mark and publisher/studio identity against available sources. Keep an unresolved mark on the asset checklist rather than silently omitting it. Preserve legal text separately. Do not copy photographic glare, page curl, hands or scanner shadows as design elements.

No new production records were created for this assessment. Normal authenticated authoring under Central remains the route for later content creation and JSON Load.

## Repair order and acceptance

First correct the front matter, then build one complete illustrated faction panel and its real reference bindings. Complete all six panels, followed by cards/sheet extracts, board examples, battles/variants and detailed-faction rails. Paginate after those real compositions exist; text-length estimates cannot determine the space an illustration needs.

For each mapped source page, compare the actual renderer with the PDF and mark every illustration, caption, label and example as present, approved omission or approved simplification. Keep source/OCR uncertainty in the source documents. Move editorial descriptions to review notes once their visual content exists. Preserve rule wording, values and order.

Check horizontal child overflow as well as page/region height, tiny labels, footer overlap and the relationship between each diagram and its explanation. Recheck all images and source identities in the real production JSON Load projection. The last check is a visual review of both HTML and exported PDF. No import or publication should be called faithful while this list remains open.
