// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:268b2f65d4c31d84ae311a3b1ac2a296e603567c935b6ab6f53fff8624c9f9d3',
  digest: '268b2f65d4c31d84ae311a3b1ac2a296e603567c935b6ab6f53fff8624c9f9d3',
  components: {
    sources: '42c28ea770d99320848c71fddac8e5e2de863ae7fb745085766ad995e5aa4f29',
    toolchain: 'db482c2717b95ef07423dfa2f9c211f36d021475a11e4b146038e88d21f50031',
    code: 'b935e70e45cd426ce528a444713c752711e59d904f3322c7888db3b594927b18',
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
