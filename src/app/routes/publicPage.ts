import { parseFormattedText } from '@shared/formattedText';
import type { FormattedTextInlineNode } from '@shared/formattedText';
import { PUBLIC_SITE_ORIGIN } from '@shared/publicDiscovery';
import { socialCardHref, SOCIAL_CARD_HEIGHT, SOCIAL_CARD_WIDTH } from '@shared/socialCard';
import type { SocialCardInput } from '@shared/socialCard';
import { useEffect } from 'react';

import { APP_TITLE, pageHead, pageTitle } from './pageTitle';

function inlineText(nodes: readonly FormattedTextInlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case 'text':
          return node.value;
        case 'line-break':
          return ' ';
        case 'mark':
          return inlineText(node.children);
      }
    })
    .join('');
}

/** Metadata uses readable authored text, with empty excerpts left empty. */
export function publicDescription(source: string | undefined): string {
  const { blocks } = parseFormattedText(source ?? '');
  const text = blocks
    .map((block) =>
      block.kind === 'paragraph'
        ? inlineText(block.children)
        : block.items.map((item) => inlineText(item.children)).join(' ')
    )
    .join(' ');
  return Array.from(text.replace(/\s+/g, ' ').trim()).slice(0, 200).join('');
}

/** A page that a structured-data trail or byline points at. */
export type PublicPageLink = { name: string; pathname: string };

/** Pluralises a counted noun for generated descriptions, as in "1 faction" or "3 Groups". */
export function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** A creator's profile as a byline link, or nothing when the profile has no public name. */
export function profileLink(
  profile: { slug: string; username: string | null } | null | undefined
): PublicPageLink | null {
  return profile?.username
    ? { name: profile.username, pathname: `/profiles/${encodeURIComponent(profile.slug)}` }
    : null;
}

const absoluteUrl = (pathname: string) => new URL(pathname, PUBLIC_SITE_ORIGIN).href;

/**
 * What a page shows, for its structured data: the site itself on the homepage, a member's work with its creator, the member, or a blog post with its author and date.
 * Catalogues and other pages name no entity.
 */
export type PublicPageEntity =
  | { type: 'site' }
  | { type: 'work'; author: PublicPageLink | null }
  | { type: 'person' }
  | { type: 'article'; author: string; published: string };

/**
 * The schema.org graph search engines read beside the visible page: the trail back to the homepage and what the page shows.
 * Every value repeats something the page already shows;
 * none is written for search engines alone.
 * Images are the record's own artwork, since the social cards are kept out of search.
 */
function structuredData({
  name,
  pathname,
  description,
  image,
  trail,
  entity,
}: {
  name: string;
  pathname: string;
  description: string;
  image: string | null | undefined;
  trail: readonly PublicPageLink[] | undefined;
  entity: PublicPageEntity | undefined;
}): Record<string, unknown> | null {
  const url = absoluteUrl(pathname);
  const imageField = image ? { image: absoluteUrl(image) } : {};
  const graph: Record<string, unknown>[] = [];
  if (trail) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [{ name: APP_TITLE, pathname: '/' }, ...trail, { name, pathname }].map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: absoluteUrl(crumb.pathname),
      })),
    });
  }
  switch (entity?.type) {
    case 'site':
      graph.push({ '@type': 'WebSite', name: APP_TITLE, url });
      break;
    case 'person':
      graph.push({ '@type': 'ProfilePage', url, mainEntity: { '@type': 'Person', name, url, ...imageField } });
      break;
    case 'work':
      graph.push({
        '@type': 'CreativeWork',
        name,
        url,
        ...imageField,
        ...(description ? { description } : {}),
        ...(entity.author
          ? { author: { '@type': 'Person', name: entity.author.name, url: absoluteUrl(entity.author.pathname) } }
          : {}),
      });
      break;
    case 'article':
      graph.push({
        '@type': 'BlogPosting',
        headline: name,
        url,
        ...imageField,
        ...(description ? { description } : {}),
        datePublished: entity.published,
        author: { '@type': 'Person', name: entity.author },
      });
      break;
  }
  return graph.length ? { '@context': 'https://schema.org', '@graph': graph } : null;
}

/** One loader result supplies the document identity, social metadata and structured data. */
export function publicPageHead({
  name,
  kind,
  pathname,
  description,
  image,
  imageDetails,
  social,
  trail,
  entity,
  match,
}: {
  name: string;
  /** What the page is, such as "Custom faction", named in the title between the page and the site, and on the social card unless that names its own. */
  kind?: string;
  pathname: string;
  description: string;
  image?: string | null;
  imageDetails?: { alt: string; type: string; width: number; height: number };
  social?: { kind?: string; shape: SocialCardInput['shape'] };
  /** The catalogue pages between the homepage and this one, for the breadcrumb trail. */
  trail?: readonly PublicPageLink[];
  entity?: PublicPageEntity;
  match?: { status: string };
}) {
  if (match?.status === 'notFound') {
    return {};
  }
  const url = absoluteUrl(pathname);
  const title = pageTitle(name, kind);
  const imagePath = social
    ? socialCardHref({ name, description, image, kind: social.kind ?? kind ?? '', shape: social.shape })
    : image || '/video/band-poster.jpg';
  const imageUrl = absoluteUrl(imagePath);
  const details = social
    ? { alt: name, type: 'image/png', width: SOCIAL_CARD_WIDTH, height: SOCIAL_CARD_HEIGHT }
    : imageDetails;
  const graph = structuredData({ name, pathname, description, image, trail, entity });
  return {
    links: [{ rel: 'canonical', href: url }],
    meta: [
      ...pageHead(name, { kind }).meta!,
      { name: 'description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Dune Zone' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: imageUrl },
      { property: 'og:image:alt', content: details?.alt ?? name },
      ...(details
        ? [
            { property: 'og:image:type', content: details.type },
            { property: 'og:image:width', content: String(details.width) },
            { property: 'og:image:height', content: String(details.height) },
          ]
        : []),
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: imageUrl },
      { name: 'twitter:image:alt', content: details?.alt ?? name },
      ...(graph ? [{ 'script:ld+json': graph }] : []),
    ],
  };
}

/** Route heads use their loader seed; the live name owns the tab after hydration, with the same kind as the head's. */
export function useLivePageTitle(name: string | undefined, kind?: string) {
  useEffect(() => {
    if (name !== undefined) {
      document.title = pageTitle(name, kind);
    }
  }, [name, kind]);
}
