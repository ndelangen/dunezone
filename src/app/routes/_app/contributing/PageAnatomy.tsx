import styles from './PageAnatomy.module.css';

export type AnatomyRegion = 'chrome' | 'band' | 'header' | 'toolbar' | 'content' | 'section' | 'footer';

/** Labels identify the shell and the slots each route fills. */
export function PageAnatomy({ active = 'chrome' }: Readonly<{ active?: AnatomyRegion }>) {
  return (
    <figure className={styles.figure}>
      <svg
        className={styles.page}
        viewBox="0 0 420 440"
        role="img"
        aria-label="Application chrome contains the header band, optional page toolbar, main content and shell footer"
      >
        <g className={styles.region} data-region="chrome" data-active={active === 'chrome' || undefined}>
          <rect className={styles.chrome} x="2" y="2" width="416" height="436" rx="8" />
          <text x="14" y="25">
            Application chrome
          </text>
        </g>
        <g className={styles.region} data-region="band" data-active={active === 'band' || undefined}>
          <rect className={styles.band} x="12" y="40" width="396" height="105" rx="5" />
          <text x="24" y="63">
            AppHeader · artwork band
          </text>
        </g>
        <g className={styles.region} data-region="header" data-active={active === 'header' || undefined}>
          <rect x="24" y="77" width="372" height="56" rx="4" />
          <text x="36" y="99">
            PageLayout.Header
          </text>
          <text className={styles.small} x="36" y="120">
            PageTitle + introduction
          </text>
        </g>
        <g className={styles.region} data-region="toolbar" data-active={active === 'toolbar' || undefined}>
          <rect x="12" y="166" width="396" height="53" rx="5" />
          <text x="24" y="187">
            PageLayout.Toolbar · optional
          </text>
          <text className={styles.small} x="24" y="207">
            Toolbar with page-wide controls
          </text>
        </g>
        <g className={styles.region} data-region="content" data-active={active === 'content' || undefined}>
          <rect x="12" y="240" width="396" height="125" rx="5" />
          <text x="24" y="263">
            PageLayout.Content
          </text>
        </g>
        <g className={styles.region} data-region="section" data-active={active === 'section' || undefined}>
          <path className={styles.section} d="M24 278H396V354H24Z" />
          <text className={styles.small} x="36" y="300">
            Section · a named region
          </text>
          <text className={styles.small} x="36" y="329">
            Surfaces, content and controls
          </text>
        </g>
        <g className={styles.region} data-region="footer" data-active={active === 'footer' || undefined}>
          <rect x="12" y="387" width="396" height="36" rx="5" />
          <text x="24" y="411">
            AppFooter · supplied by the shell
          </text>
        </g>
      </svg>
    </figure>
  );
}
