// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:6ae9e75286ec4c68fcabea5605d9d3574fdc1adabae37919d66765884675ba29',
  digest: '6ae9e75286ec4c68fcabea5605d9d3574fdc1adabae37919d66765884675ba29',
  components: {
    sources: '35dcbe18feb7be0d824f53c8f8add3fd369f3e5f92a0dce467c121b032f0e12e',
    toolchain: 'f4c69d90dcb347d91cc47266b21853233aee418d21bfd8804e654b9121022db4',
    code: '9c1f47a77e3d6bfbacf3d6d09201a42f68cbaf33376fa585765e527946b64aff',
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
