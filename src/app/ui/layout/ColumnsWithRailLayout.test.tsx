import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ColumnsWithRailLayout } from './ColumnsWithRailLayout';

describe('ColumnsWithRailLayout', () => {
  it('renders each slot, in source order', () => {
    const markup = renderToStaticMarkup(
      <ColumnsWithRailLayout>
        <ColumnsWithRailLayout.Primary>
          <p>Primary region</p>
        </ColumnsWithRailLayout.Primary>
        <ColumnsWithRailLayout.Secondary>
          <p>Secondary region</p>
        </ColumnsWithRailLayout.Secondary>
        <ColumnsWithRailLayout.Rail>
          <p>Rail region</p>
        </ColumnsWithRailLayout.Rail>
      </ColumnsWithRailLayout>
    );

    expect(markup).toContain('<p>Primary region</p>');
    expect(markup).toContain('<p>Secondary region</p>');
    expect(markup).toContain('<p>Rail region</p>');
    expect(markup.indexOf('Primary region')).toBeLessThan(markup.indexOf('Secondary region'));
    expect(markup.indexOf('Secondary region')).toBeLessThan(markup.indexOf('Rail region'));
  });
});
