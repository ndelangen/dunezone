import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PageLayout } from './PageLayout';

describe('PageLayout', () => {
  it('renders the route-owned slots in page order', () => {
    const markup = renderToStaticMarkup(
      <PageLayout header={<h1>Page title</h1>} toolbar={<div>Page tools</div>}>
        <p>Page content</p>
      </PageLayout>
    );

    expect(markup).toContain('<h1>Page title</h1>');
    expect(markup).not.toContain('data-page-layout-compact');
    expect(markup).toContain('data-page-layout-header-size="default"');
    expect(markup.indexOf('Page title')).toBeLessThan(markup.indexOf('Page tools'));
    expect(markup.indexOf('Page tools')).toBeLessThan(markup.indexOf('Page content'));
  });

  it('supports a shorter hero for content-heavy detail pages', () => {
    const markup = renderToStaticMarkup(
      <PageLayout header={<h1>Faction</h1>} headerSize="compact">
        <p>Faction content</p>
      </PageLayout>
    );

    expect(markup).toContain('data-page-layout-header-size="compact"');
    expect(markup).not.toContain('data-page-layout-compact');
  });

  it('supports an intentionally compact page without a header slot', () => {
    const markup = renderToStaticMarkup(
      <PageLayout>
        <p>Minimal content</p>
      </PageLayout>
    );

    expect(markup).not.toContain('<h1');
    expect(markup).toContain('data-page-layout-compact="true"');
    expect(markup).toContain('<main');
    expect(markup).toContain('Minimal content');
  });
});
