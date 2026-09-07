import { element, makePage, placeFlow, renderItem, sectionHeading } from './core.mjs';

/*
 * The section rail gives each reading band a place in the sequence.
 * Narrow pages put that context above the text without changing its body size.
 */
export function renderGuided(host, specimen, format) {
  const pages = [];
  const flowItems = specimen.sections.flatMap((section, sectionIndex) =>
    section.items.map((item, itemIndex) => ({
      id: item.id,
      section,
      item,
      sectionIndex,
      startsSection: itemIndex === 0,
    }))
  );

  const placements = placeFlow(
    flowItems,
    (pageIndex) => {
      const { page, body } = makePage(host, specimen, format, 'guided', pageIndex);
      page.classList.add('guided-page');
      if (format.width < 140) {
        page.classList.add('guided-page--tall');
      }
      body.classList.add('guided-body');

      const flow = element('div', 'guided-flow');
      flow.dataset.region = 'guided bands';
      body.append(flow);
      pages.push(page);
      return [flow];
    },
    ({ section, item, sectionIndex, startsSection }, continued) => {
      const band = element('section', 'guided-band');
      const showContext = startsSection || continued;
      if (showContext) {
        band.classList.add('guided-band--section');
      }
      if (continued && !startsSection) {
        band.classList.add('guided-band--continued');
      }
      if (section.kind === 'table') {
        band.classList.add('guided-band--table');
      }
      band.dataset.sectionId = section.id;

      const rail = element('div', 'guided-rail');
      if (showContext) {
        rail.append(element('span', 'guided-step', String(sectionIndex + 1).padStart(2, '0')));
        rail.append(sectionHeading(section, continued && !startsSection));
      } else {
        rail.setAttribute('aria-hidden', 'true');
      }

      const content = renderItem(item, section, 'normal');
      content.classList.add('guided-item');
      if (item.asset) {
        content.classList.add('guided-item--illustrated');
      }
      if (section.kind === 'table') {
        content.classList.add('guided-item--table');
      }
      band.append(rail, content);
      return band;
    }
  );

  return { pages, placements };
}
