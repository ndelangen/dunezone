// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:6a5dabb7f292962d714c23a44610d255c68f6c78fbfaa9f0be5a74a8169822c4',
  digest: '6a5dabb7f292962d714c23a44610d255c68f6c78fbfaa9f0be5a74a8169822c4',
  components: {
    sources: '1e65c5717fc30742cb0fa143568f582ec5e160ad3fa29d5db7c1b90bb36e999a',
    toolchain: '16c805c7c848647a49cede4b962435ec093b4d311f7d7e57baaf6adc7efad6a5',
    code: 'c98cfb88ed41cc090ef39cf07b0bbcdd552c175aa54cdbe695884e0f95bc22ca',
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
