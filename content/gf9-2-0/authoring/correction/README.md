# Faction overview correction

The corrected local preview uses the existing Faction introduction Blocks. Four compact rows share source page 4. Source page 5 has Guild and Harkonnen rows above the objective. The existing Step-by-step layout supplies the tighter spacing needed for the four rows; the second page uses Paired rows.

The local book has 61 pages. Only the seven former overview/objective pages are replaced. Every other page matches the preserved production draft, including the user's cover edit removing its supporting text.

`before-overview.json` backs up production draft revision 3, including the edits that were unsaved when this correction began. The main `../rulebook.json` remains that production manuscript. The `rulebook.json`, source map, composition and validation in this folder are the pending correction. Its `pending-gf9-2-0-*` references must be bound to the second-edition faction records before production Load.

`preview-references.json` supplies temporary roster images. Missing or not-yet-corrected portraits are explicitly labelled as pending. Local token captures remain in the authoring workspace and are not added to the artwork catalogue. These are preview references, not production records.

The user assigned the new stock artwork to the “Restore missing cover image detail” chat. That chat is preparing PR #2470 and has been asked to alert this chat when the artwork is deployed. It confirmed that faction records and faction-token publication are outside its scope. `../../components/overview-factions-package.json` prepares the six second-edition faction records using that artwork and existing stock portraits. It has not been imported.

The existing older GF9 faction records must remain unchanged. Once the artwork is deployed, validate the faction package against the deployed catalogue, import it through the authenticated application under Central into GF9 2.0 and the GF9 group, and bind the resulting records. Then check the published leader tokens and save the corrected Rulebook through its normal editor.
