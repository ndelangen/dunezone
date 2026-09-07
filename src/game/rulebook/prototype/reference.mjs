/** The reference variant treats source entries as individually findable records. */
import { element, makePage, placeFlow, renderItem } from './core.mjs';

export function renderReference(host, specimen, format) {
  if (specimen.id === 'karama' && format.id !== 'tall') {
    return renderLookup(host, specimen, format);
  }
  const pages = [];
  const items = specimen.sections.flatMap((section) =>
    section.items.map((item, index) => ({ id: item.id, section, item, first: index === 0 }))
  );
  const placements = placeFlow(
    items,
    (pageIndex) => {
      const { page, body } = makePage(host, specimen, format, 'reference', pageIndex);
      pages.push(page);
      const grid = element('div', `reference-grid ${format.id === 'tall' ? 'reference-single' : ''}`);
      const regions = Array.from({ length: format.id === 'tall' ? 1 : 2 }, () => element('div', 'reference-column'));
      grid.append(...regions);
      body.append(grid);
      return regions;
    },
    ({ section, item, first }, continued) => {
      const record = element('div', `reference-record ${section.kind === 'table' ? 'reference-table' : ''}`);
      record.append(
        element('div', 'reference-category', `${section.title}${continued && !first ? ' / continued' : ''}`)
      );
      record.append(renderItem(item, section, 'record'));
      return record;
    }
  );
  return { pages, placements };
}

/** Wide paper preserves the lookup as a table; tall paper uses labeled records. */
function renderLookup(host, specimen, format) {
  const pages = [];
  const placements = [];
  let body;
  let table;
  let rows;
  function nextPage() {
    const result = makePage(host, specimen, format, 'reference', pages.length);
    body = result.body;
    body.classList.add('reference-table-body');
    pages.push(result.page);
    table = element('table', 'reference-native');
    const head = element('thead');
    const titles = element('tr');
    for (const title of ['Faction', 'Ability', 'Effect']) {
      const cell = element('th', '', title);
      cell.scope = 'col';
      titles.append(cell);
    }
    head.append(titles);
    rows = element('tbody');
    table.append(head, rows);
    body.append(table);
  }
  nextPage();
  for (const section of specimen.sections) {
    for (const item of section.items) {
      const row = element('tr', 'content-unit');
      row.dataset.contentId = item.id;
      const group = element('th', '', section.title);
      group.scope = 'row';
      row.append(group);
      if (item.cells) {
        row.append(...item.cells.map((text) => element('td', '', text)));
      } else {
        const note = element('td', '', item.paragraphs.join(' '));
        note.colSpan = 2;
        row.append(note);
      }
      rows.append(row);
      if (
        table.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom + 0.5 &&
        rows.children.length > 1
      ) {
        row.remove();
        nextPage();
        rows.append(row);
      }
      const overflow = table.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom + 0.5;
      placements.push({ id: item.id, page: pages.length, region: 1, overflow });
    }
  }
  return { pages, placements };
}
