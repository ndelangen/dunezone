export default () =>
  Array.from(document.querySelectorAll('[data-rulebook-page]')).map((page) => {
    const bounds = page.getBoundingClientRect();
    const paddingBottom = Number.parseFloat(getComputedStyle(page.querySelector('.rulebookPageContent')).paddingBottom);
    return {
      id: page.getAttribute('data-rulebook-page-id'),
      layout: page.getAttribute('data-rulebook-layout'),
      regions: Array.from(page.querySelectorAll('[data-rulebook-region]')).map((region) => {
        const box = region.getBoundingClientRect();
        const blocks = Array.from(region.querySelectorAll('[data-rulebook-block-id]'));
        return {
          key: region.getAttribute('data-rulebook-region'),
          available: bounds.bottom - paddingBottom - box.top,
          gap: Number.parseFloat(getComputedStyle(region.firstElementChild).rowGap) || 0,
          bottom: blocks.length
            ? Math.max(...blocks.map((block) => block.getBoundingClientRect().bottom)) - box.top
            : 0,
          blocks: blocks.map((block) => ({
            id: block.getAttribute('data-rulebook-block-id'),
            height: block.getBoundingClientRect().height,
            overflowWidth: block.scrollWidth - block.clientWidth,
          })),
        };
      }),
    };
  });
