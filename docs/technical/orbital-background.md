# Orbital background

`src/app/shell/planet.webp` is the approved hand-painted desert planet, 1024 × 1024 pixels and 57,486 bytes, without an alpha channel. Vite gives it a content-hashed URL. The shell supplies its circular mask, fixed lighting and halo. Its measured disc centre is 511,505, and the SVG view box fits the painted rim before rotation.

The app uses warm dark colours regardless of the OS hint or an older saved light preference. Document renderers keep their paper styling. The planet stays anchored with its upper 20% visible and completes one turn per local clock hour. The SVG stars turn in the opposite direction over two hours, and keep turning while the page scrolls. Where the browser supports scroll-driven animations, the stars also follow scroll parallax on the compositor; elsewhere (Firefox today, Safari before 26) they stay put rather than run script on every scroll frame. The ambient-motion preference pauses these effects. A fullscreen workspace hides the backdrop.

The built-in image generator created the artwork using the header video's muted umber, ochre and sand hues. [The provenance record](orbital-planet.provenance.json) contains the prompt, encoding settings and asset hash. The local prototype branches preserve the source PNG on `norbert/app-shell-option-b` and Option A on `norbert/app-shell-option-a`.
