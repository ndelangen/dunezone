// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:354d7382b413add7cc8ec0a9db1522a56247ff82c3a60b45f1eec2e26ae03599',
  digest: '354d7382b413add7cc8ec0a9db1522a56247ff82c3a60b45f1eec2e26ae03599',
  components: {
    sources: '578323223bc114d3456b39e6ca9a7d9da059a62272896efbbedff24314a01557',
    toolchain: 'df38b3277de26c074c7b12763e5a5817e5c08c6940bd94f4e1e5c531dcf21b5b',
    code: 'aec629766ea704fdc0d779185eeb68c329109cc90e778617f3f92ceb392f643a',
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
