// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity:
    'faction-sheet/sha256:55620874e6f9451674ccfde49e1c2bb0e0bc048f5cb5d89a864c9a3b80a5a32c',
  digest: '55620874e6f9451674ccfde49e1c2bb0e0bc048f5cb5d89a864c9a3b80a5a32c',
  components: {
    sources: 'b2094f966342b3617034f870a451736d003bd530d706c2387716823f4bc742f6',
    toolchain: 'cb3071d3158d0106b6ad5dd7e0640b0fe8976539005cf4f5dc4f1b225491298b',
    code: 'fecf6111958364f34b02fe9749ba4c872b22799cef6f9808ea3680abbcb05003',
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
