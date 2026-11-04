// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:5a5dfa833fed076de34a91466a27ae1f8da6dd5c757321f5ca39f927cce65adf',
  digest: '5a5dfa833fed076de34a91466a27ae1f8da6dd5c757321f5ca39f927cce65adf',
  components: {
    sources: '50c38c616b87bd53e4476f6b24dd781dd86c59b5d54a652be95bbc420d8813f4',
    toolchain: '1b4f9ee0796e041ae0c7c3de5fa70a487dde04bc6ef09182ccdd84c9cb5903ee',
    code: 'bd0a592ea659dbeefaacc752c8c091f574cc02463867bb4f36c185adfdc845aa',
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
