# Media index prototype

Throwaway branch: `norbert/media-index-prototypes`.
Implementation checkpoint: `norbert/media-search-index`, commit `10118e38f`.
Issue: https://github.com/ndelangen/dunezone/issues/1604

Run with `APP_DEV_PORT=3184 bun run app:dev`, then open `/media?variant=A`.
The switcher and prototype rendering run only in development. Gallery links open the working public galleries.

## Decisions

Round 1 is preserved in commit `45aea5bb0`. It compared a collection wall, illustrated directory and gallery browser.
The user chose the collection wall, found it too spread out, and liked the loose arrangement of the decals.
They requested three refinements with different artwork sizes.

Round 2 keeps that direction:

- A, Tight wall: larger leader and decal groups above six smaller groups.
- B, Even grid: eight equal tiles with differently sized artwork inside them.
- C, Decals first: one large decal collage beside leaders and six smaller groups.

All three use tighter gaps, less copy and varied image sizes. Leaders remain circular. The index has no search toolbar.
The floating controls and left/right arrow keys switch variants and update the URL. Text fields retain their arrow keys.
The second-round choice is pending. Do not promote these prototypes or the switcher into production.
