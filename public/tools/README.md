# Tool tile pictures

These WebP images are the pictures on the `/tools` catalogue's tiles, named by the tool's slug (or the tool's folder)
in `src/app/routes/_app/tools/tools.ts`.

They are 640 by 400 pixels at WebP quality 72. Most are composed from the tool's own card faces and rendered at twice
the size before being scaled down.

A tool the homepage features has a `-large` copy at 1280 by 800, the same picture rendered at twice the size, so it stays
sharp at the homepage's width.

The Bidding picture was generated with the built-in image generation tool, using the existing tool pictures and the
Bidding tablet view as references. Its circular faction tokens, bidder arrow, card deck and spice evoke an auction at
the table. The generated source was resized to both WebP sizes at quality 72.
