/** Throwaway physical-page and measurement machinery for the Rulebook spike. */
export const formats = [
  { id: 'square', label: 'Square', width: 210, height: 210, inner: 12, outer: 10 },
  { id: 'a4', label: 'A4', width: 210, height: 297, inner: 14, outer: 12 },
  { id: 'tall', label: 'Tall', width: 105, height: 297, inner: 10, outer: 8 },
];

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

export function makePage(host, specimen, format, variant, index) {
  const page = element('section', `prototype-page ${variant}-page`);
  page.style.width = `${format.width}mm`;
  page.style.height = `${format.height}mm`;
  page.style.paddingLeft = `${index % 2 ? format.outer : format.inner}mm`;
  page.style.paddingRight = `${index % 2 ? format.inner : format.outer}mm`;
  page.dataset.page = String(index + 1);
  page.dataset.format = format.id;
  const header = element('header', 'page-header');
  const titles = element('div', 'page-titles');
  titles.append(element('div', 'page-kicker', 'DUNE / RULEBOOK STUDY'));
  titles.append(element('h1', '', specimen.title));
  titles.append(element('p', 'page-subtitle', specimen.subtitle));
  header.append(titles);
  if (specimen.emblem) {
    const img = element('img', 'page-emblem');
    img.src = specimen.emblem;
    img.alt = '';
    header.append(img);
  }
  const body = element('div', 'page-body');
  const footer = element('footer', 'page-footer');
  footer.append(element('span', '', 'Historical text / layout specimen'), element('span', 'folio', String(index + 1)));
  page.append(header, body, footer);
  host.append(page);
  return { page, body };
}

export function sectionHeading(section, continued = false) {
  return element('h2', 'section-heading', `${section.title}${continued ? ' / continued' : ''}`);
}

export function renderItem(item, section, mode = 'normal') {
  const article = element('article', `content-unit item-${section.kind} mode-${mode}`);
  article.dataset.contentId = item.id;
  if (item.asset) {
    const img = element('img', 'item-asset');
    img.src = item.asset;
    img.alt = item.title;
    img.width = 145;
    img.height = 145;
    article.append(img);
  }
  if (section.kind === 'table' && item.cells?.length) {
    const cells = element('dl', 'item-cells');
    item.cells.forEach((value, index) => {
      const pair = element('div', 'item-cell');
      pair.append(element('dt', '', section.columns?.[index] || `Field ${index + 1}`));
      pair.append(element('dd', '', value));
      cells.append(pair);
    });
    article.append(cells);
  } else if (item.title) {
    article.append(element('h3', 'item-title', item.title));
  }
  for (const paragraph of item.paragraphs || []) {
    article.append(element('p', '', paragraph));
  }
  if (item.note) {
    article.append(element('p', 'item-note', item.note));
  }
  return article;
}

export function fits(region) {
  if (!region.lastElementChild) {
    return true;
  }
  const bounds = region.getBoundingClientRect();
  const child = region.lastElementChild.getBoundingClientRect();
  const padding = Number.parseFloat(getComputedStyle(region).paddingBottom) || 0;
  return child.bottom <= bounds.bottom - padding + 0.5;
}

export function placeFlow(items, createRegions, render) {
  let pageIndex = 0;
  let regionIndex = 0;
  let regions = createRegions(pageIndex);
  const placements = [];
  for (const item of items) {
    let continued = false;
    let region = regions[regionIndex];
    let node = render(item, continued);
    region.append(node);
    if (!fits(region) && region.children.length > 1) {
      node.remove();
      regionIndex += 1;
      if (regionIndex >= regions.length) {
        regionIndex = 0;
        pageIndex += 1;
        regions = createRegions(pageIndex);
      }
      region = regions[regionIndex];
      continued = true;
      node = render(item, continued);
      region.append(node);
    }
    const overflow = !fits(region);
    if (overflow) {
      node.dataset.overflow = 'true';
    }
    placements.push({ id: item.id || item.item.id, page: pageIndex + 1, region: regionIndex + 1, overflow });
  }
  return placements;
}
