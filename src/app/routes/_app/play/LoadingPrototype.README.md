# Prototype 1270: a Play table route animating in

Throwaway, never merged. Three variants were built on the real `/play/demo` route with `?variant=A|B|C&hold=<ms>` and a floating switcher; tag `prototype/1270-all-variants` holds all three. Norbert picked **C, the iris**, on 2026-09-19, and this branch is pruned to it.

- A, line drawing: the table drawn in the site's dice line-art, the real table fading in beneath. Rejected.
- B, sand rises: sand-coloured light drifting along the bottom, the table rising out of it. Rejected.
- C, iris: a pool of light breathing behind the status line, the table opening through an iris from that point. Accepted; delivered by #1274.

Run: `VITE_CONVEX_URL=<deployment> bunx vite dev --port 3123` and open `/play/demo?variant=C&hold=3200`.
