// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:267ee0c198b4f1a7879b2ff9d5f54b584ab22c73a31ab34852eab6b73688dfb0',
  digest: '267ee0c198b4f1a7879b2ff9d5f54b584ab22c73a31ab34852eab6b73688dfb0',
  components: {
    sources: 'cc48b8a70987e5803eaf4d881529d63a68d430d961d9b14762ade5d93e6ae97f',
    toolchain: '16c805c7c848647a49cede4b962435ec093b4d311f7d7e57baaf6adc7efad6a5',
    code: '5f0e83198c7def2ce56a3537505dcd8f77dc8fb6da73fc98058dbd33ccec92eb',
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
