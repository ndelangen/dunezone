// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:32ed96439d5559f8742c286a5518c88773b3b5335d1baa5ce4a790dba981e9d3',
  digest: '32ed96439d5559f8742c286a5518c88773b3b5335d1baa5ce4a790dba981e9d3',
  components: {
    sources: '90969c7a1906d2e9726da84bf18593ec9eaea358a5d3f19d49a7e972f144010c',
    toolchain: 'df7288c5062038eb672a31ccbbf765effaa626c1f9d4898069a5dedae3592acb',
    code: 'd7dcf864fb8b41aaaecbca061c17f0fce29ce60d3a8fb7f5da9da2063f774fcf',
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
