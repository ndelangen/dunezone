import { element, makePage, placeFlow, renderItem, sectionHeading } from './core.mjs';

/**
 * Traditional columns preserve a continuous reading order across page turns.
 * A section heading travels with its first entry and repeats after a region break.
 */
export function renderClassic(host, specimen, format) {
  const pages = [];
  const items = specimen.sections.flatMap((section) =>
    section.items.map((item, index) => ({ id: item.id, section, item, isFirst: index === 0 }))
  );

  const flow = placeFlow(
    items,
    (pageIndex) => {
      const { page, body } = makePage(host, specimen, format, 'classic', pageIndex);
      page.classList.add('classic-page');
      page.dataset.pageFormat = format.id;
      body.classList.add('classic-body');
      const columns = element('div', 'classic-columns');
      const columnCount = format.width < 150 ? 1 : 2;
      columns.style.setProperty('--classic-column-count', String(columnCount));
      const regions = Array.from({ length: columnCount }, (_, index) => {
        const column = element('div', 'classic-column');
        column.dataset.region = `column-${index + 1}`;
        columns.append(column);
        return column;
      });
      body.append(columns);
      pages.push(page);
      return regions;
    },
    ({ section, item, isFirst }, continued) => {
      const entry = element('div', 'classic-entry');
      entry.dataset.kind = section.kind;
      if (isFirst || continued) {
        entry.classList.add('classic-section-start');
        const heading = sectionHeading(section, !isFirst);
        heading.classList.add('classic-section-heading');
        entry.append(heading);
      }
      const content = renderItem(item, section, 'normal');
      content.classList.add('classic-content');
      if (item.asset) {
        content.classList.add('classic-content-illustrated');
      }
      entry.append(content);
      return entry;
    }
  );

  return { pages, placements: flow.placements ?? flow };
}
