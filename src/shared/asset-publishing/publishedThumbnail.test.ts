import { describe, expect, it } from 'vite-plus/test';

import { publishedThumbnailSrc, publishedThumbnailWidth } from './publishedThumbnail';

describe('publishedThumbnailSrc', () => {
  const leader =
    '/published/leaders/k172ctk6mrn1737apwefk4dyvd8fewhr.adf5bb71-8832-4871-89c9-c4263ab1eda0/leader.jpg?v=1';
  const card = '/published/cards/k172ctk6mrn1737apwefk4dyvd8fewhr/card.jpg?v=2';

  it('asks for the smallest listed width that covers the slot', () => {
    expect(publishedThumbnailSrc(card, 90)).toBe(`${card}&w=160`);
    expect(publishedThumbnailSrc(card, 161)).toBe(`${card}&w=320`);
    expect(publishedThumbnailSrc(card, 600)).toBe(`${card}&w=640`);
  });

  it('keeps the original when the slot needs the capture or more', () => {
    expect(publishedThumbnailSrc(card, 641)).toBe(card);
    /* A 600px leader is no larger than the 640 copy, so the original serves. */
    expect(publishedThumbnailSrc(leader, 400)).toBe(leader);
    expect(publishedThumbnailSrc(leader, 120)).toBe(`${leader}&w=160`);
  });

  it('keeps an absolute URL absolute', () => {
    expect(publishedThumbnailSrc(`https://dune.zone${card}`, 100)).toBe(`https://dune.zone${card}&w=160`);
  });

  it('leaves anything that is not an image publication alone', () => {
    expect(publishedThumbnailSrc('/published/factions/k172ctk6mrn1737apwefk4dyvd8fewhr/sheet.pdf', 100)).toBe(
      '/published/factions/k172ctk6mrn1737apwefk4dyvd8fewhr/sheet.pdf'
    );
    expect(publishedThumbnailSrc('/m/4e47f3e5fc4284ed21ac.48ba2d96e6.jpg', 100)).toBe(
      '/m/4e47f3e5fc4284ed21ac.48ba2d96e6.jpg'
    );
    expect(publishedThumbnailSrc(card, 0)).toBe(card);
  });
});

describe('publishedThumbnailWidth', () => {
  it('admits only listed widths', () => {
    expect(publishedThumbnailWidth('320')).toBe(320);
    expect(publishedThumbnailWidth('300')).toBeNull();
    expect(publishedThumbnailWidth(null)).toBeNull();
  });
});
