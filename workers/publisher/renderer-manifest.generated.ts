// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:072e4149589262790dccceaa271c4f27a39f14332fb5ef15c0d527604ef8ce2a',
  digest: '072e4149589262790dccceaa271c4f27a39f14332fb5ef15c0d527604ef8ce2a',
  components: {
    sources: '63321c9b4a6399e25957daa43526f51f8d5cf83735ce9286d3579eddb5264ac7',
    toolchain: '862154f6813aeaa0fd73c238ef8c80b979c289b6a9da8685e2495cf86586e9ed',
    code: '8c1c3dd5c1d85bbf918c11c7e6ba0bdfcf6c7871ffe542263e7d6dc80cc20740',
    contract: '2920714c87493d104342355dda2b956202259513c78ce6195670034f31a656a6',
  },
  contract: {
    viewport: {
      width: 2100,
      height: 2970,
      deviceScaleFactor: 1,
    },
    pdf: {
      pageCount: 2,
      pageWidthMm: 210,
      pageHeightMm: 297,
      pageSizeToleranceMm: 0.5,
      displayHeaderFooter: false,
      marginMm: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
      preferCssPageSize: true,
      printBackground: true,
    },
  },
} as const;
