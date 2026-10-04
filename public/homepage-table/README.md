# Homepage table artwork

These WebP images are display copies of the public artwork used by the approved homepage preview.
The source JPEGs remain in `.storybook/static/play-fixtures`, documented by
`src/app/routes/_app/play/product.stories.fixture/README.md`. Production reads only this directory
and the curated labels in `src/shared/homepage/artwork.json`.

Tokens and cards are 512 pixels wide; troop discs are 256 pixels wide. The copies use WebP quality
85. They preserve the authored artwork and its aspect ratio.

The deck also uses the three public cards already shown on the homepage: Supplies! and Trishula! by
Central, and Arrakeen by IHasPinecone. Their source JPEGs were read on 2026-10-04 from
`https://dune.zone/published/cards/<id>/card.jpg`, with ids
`ns78nmym3qpth6sm9wsfj3ka9s8cw350`, `ns7cgwf2xm2ppj3c5jtpnnehf98cxcbq`, and
`ns74r72v6mdmnn8ahdmj27c8gs8cz5t6`. The sample deck repeats these four card designs, including
Snooper, across ten cards. It demonstrates community artwork and physical handling.
