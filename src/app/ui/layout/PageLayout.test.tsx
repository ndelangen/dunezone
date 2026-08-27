import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PageLayout } from './PageLayout';

describe('PageLayout', () => {
  it('renders the route-owned slots in page order', () => {
    const markup = renderToStaticMarkup(
      <PageLayout>
        <PageLayout.Header>
          <h1>Page title</h1>
        </PageLayout.Header>
        <PageLayout.Toolbar>
          <div>Page tools</div>
        </PageLayout.Toolbar>
        <PageLayout.Content>
          <p>Page content</p>
        </PageLayout.Content>
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
      <PageLayout>
        <PageLayout.Header size="compact">
          <h1>Faction</h1>
        </PageLayout.Header>
        <PageLayout.Content>
          <p>Faction content</p>
        </PageLayout.Content>
      </PageLayout>
    );

    expect(markup).toContain('data-page-layout-header-size="compact"');
    expect(markup).not.toContain('data-page-layout-compact');
  });

  it('supports an intentionally compact page without a header slot', () => {
    const markup = renderToStaticMarkup(
      <PageLayout>
        <PageLayout.Content>
          <p>Minimal content</p>
        </PageLayout.Content>
      </PageLayout>
    );

    expect(markup).not.toContain('<h1');
    expect(markup).toContain('data-page-layout-compact="true"');
    expect(markup).toContain('<main');
    expect(markup).toContain('Minimal content');
  });

  it('lets content opt into the viewport measure without widening the toolbar', () => {
    const markup = renderToStaticMarkup(
      <PageLayout>
        <PageLayout.Toolbar>
          <div>Page tools</div>
        </PageLayout.Toolbar>
        <PageLayout.Content width="viewport">
          <p>Wide content</p>
        </PageLayout.Content>
      </PageLayout>
    );

    expect(markup).toContain('data-page-layout-toolbar="true"');
    expect(markup).toContain('data-page-layout-content-width="viewport"');
    expect(markup.indexOf('data-page-layout-toolbar')).toBeLessThan(
      markup.indexOf('data-page-layout-content-width="viewport"')
    );
  });
});
