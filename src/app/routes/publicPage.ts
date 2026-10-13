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
 * The schema.org graph search engines read beside the visible page: the site's name on the homepage, and on detail pages the trail back to it plus what the page is and who made it.
 * Every value repeats something the page already shows;
 * none is written for search engines alone.
 */
function structuredData({
  name,
  pathname,
  description,
  imageUrl,
  trail,
  author,
  profile,
}: {
  name: string;
  pathname: string;
  description: string;
  imageUrl: string;
  trail?: readonly PublicPageLink[];
  author?: PublicPageLink | null;
  profile?: boolean;
}): Record<string, unknown> | null {
  const url = absoluteUrl(pathname);
  const graph: Record<string, unknown>[] = [];
  if (pathname === '/') {
    graph.push({ '@type': 'WebSite', name: APP_TITLE, url });
  }
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
  if (profile) {
    graph.push({ '@type': 'ProfilePage', url, mainEntity: { '@type': 'Person', name, url, image: imageUrl } });
  } else if (author) {
    graph.push({
      '@type': 'CreativeWork',
      name,
      url,
      image: imageUrl,
      ...(description ? { description } : {}),
      author: { '@type': 'Person', name: author.name, url: absoluteUrl(author.pathname) },
    });
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
  author,
  profile,
  match,
}: {
  name: string;
  /** What the page is, such as "Custom faction", named in the title between the page and the site. */
  kind?: string;
  pathname: string;
  description: string;
  image?: string | null;
  imageDetails?: { alt: string; type: string; width: number; height: number };
  social?: { kind: string; shape: SocialCardInput['shape'] };
  /** The catalogue pages between the homepage and this one, for the breadcrumb trail. */
  trail?: readonly PublicPageLink[];
  /** The profile of whoever made what this page shows. */
  author?: PublicPageLink | null;
  /** The page is a member's profile, so the structured data names a person rather than a work. */
  profile?: boolean;
  match?: { status: string };
}) {
  if (match?.status === 'notFound') {
    return {};
  }
  const url = absoluteUrl(pathname);
  const title = pageTitle(name, kind);
  const imagePath = social
    ? socialCardHref({ name, description, image, ...social })
    : image || '/video/band-poster.jpg';
  const imageUrl = absoluteUrl(imagePath);
  const details = social
    ? { alt: name, type: 'image/png', width: SOCIAL_CARD_WIDTH, height: SOCIAL_CARD_HEIGHT }
    : imageDetails;
  const graph = structuredData({ name, pathname, description, imageUrl, trail, author, profile });
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
