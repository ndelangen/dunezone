# Approved leader portraits

The 48 faction directories added on 30 September 2026 contain 336 approved portraits, seven per faction. Vark Houses and Nareth Hollow were rejected during review and are excluded. These are original custom faction concepts, not additional official Dune characters.

The artwork uses the sparse painted treatment approved during the leader review. BiRefNet separates the foreground from the generated ochre wash. Compositing places that foreground on RGB 205, 186, 120 (`#CDBA78`), sampled from the existing GF9 Gurney, Duncan and Stilgar files. The process preserves the original RGB values wherever the foreground mask is fully opaque and blends only at the boundary. A colour-based pass removes connected remnants of the old wash that segmentation retained. It does not generate or repaint faces.

Sources in this directory are lossless RGB PNGs at 640 by 640 pixels. Full-resolution 1254-pixel approved originals, processed masters, masks and receipts are retained in the local leader review collection. The regular image pipeline generates the same small and large WebP variants used by all existing leaders.

The leader picker lists each set as a named browsing collection, with category, leader names and roles available for search. Names, roles and faction groupings are recorded in `src/game/assets/faction/leader/approvedLeaders.stories.fixture.tsx`. Storybook has an approved collection overview and one story per faction, including sample leader tokens. Token strengths and the emblem in these stories are preview choices; this change does not create faction records or game rules.

Background processing uses [BiRefNet](https://github.com/ZhengPeng7/BiRefNet) and its [MIT-licensed model weights](https://huggingface.co/ZhengPeng7/BiRefNet). The approved source and resulting game-file hashes are recorded in `approved-leaders.provenance.json`.
