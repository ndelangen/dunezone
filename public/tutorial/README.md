# Tutorial tile stills

These WebP images are the pictures on the `/tutorial` landing page's chapter tiles, one per chapter, named by the
chapter's slug in `src/app/routes/_app/tutorial/chapters.ts`.

They are 640 by 400 pixel crops of Play screenshots taken from the Play Storybook stories (Play/Sandbox, Play/Journey
and the panel stories), at WebP quality 72. They stand in for the live preview each tile will animate once its chapter
is built.

Each still also has a JPEG copy under `media/web/tutorial/` (same name, `create/` for the creator tutorials), which the
media pipeline serves to the social card renderer: the renderer reads only media-pipeline JPEGs. A new or changed still
needs its JPEG copy added there, locked and uploaded like any other raster original; `socialImage.test.ts` fails when an
indexed tutorial has none.
