import { getRulebookLayoutsForSize } from '@shared/rulebooks/contents';
import { rulebookDesignCatalogue, rulebookSizeCatalogue } from '@shared/rulebooks/settings';
import { expect } from 'storybook/test';

import { createCataloguePage } from './RulebookCatalogue.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

export function HeadingMatrix() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, padding: 24 }}>
      {rulebookSizeCatalogue.flatMap(({ id: size }) =>
        rulebookDesignCatalogue.flatMap(({ id: design }) =>
          [false, true].flatMap((icon) =>
            getRulebookLayoutsForSize(size)
              .filter(({ id }) => id !== 'cover')
              .map(({ id: layout }) => (
                <div
                  key={`${size}-${design}-${icon}-${layout}`}
                  data-heading-case={`${size}-${design}-${icon}`}
                  style={{ width: 300 }}
                >
                  <p>
                    {size} / {design} / {layout} / {icon ? 'icon' : 'text'}
                  </p>
                  <RulebookPageRenderer
                    page={{
                      ...createCataloguePage(layout, { empty: true }),
                      title: 'Battle',
                      headingIcon: icon ? '/vector/icon/combat.svg' : undefined,
                    }}
                    settings={{ size, design }}
                  />
                </div>
              ))
          )
        )
      )}
    </div>
  );
}

export function verifyHeadingConsistency(canvasElement: HTMLElement) {
  const baselines = new Map<string, string[]>();
  const properties = [
    'color',
    'background-color',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'text-align',
    'text-transform',
    'padding',
    'border',
    'border-radius',
    'display',
    'align-items',
    'justify-content',
    'gap',
  ];
  for (const host of canvasElement.querySelectorAll<HTMLElement>('[data-heading-case]')) {
    const heading = host.querySelector('h1')!;
    const style = getComputedStyle(heading);
    const appearance = properties.map((property) => style.getPropertyValue(property));
    const icon = heading.querySelector('span');
    if (icon) {
      const iconStyle = getComputedStyle(icon);
      appearance.push(iconStyle.width, iconStyle.height, iconStyle.borderRadius, iconStyle.backgroundColor);
    }
    const key = host.dataset.headingCase!;
    const baseline = baselines.get(key);
    if (baseline) {
      expect(
        appearance,
        `${key} / ${host.querySelector('[data-rulebook-layout]')?.getAttribute('data-rulebook-layout')}`
      ).toEqual(baseline);
    } else {
      baselines.set(key, appearance);
    }
  }
}
