import { parseFormattedText } from '@shared/formattedText';
import type { FormattedTextInlineNode } from '@shared/formattedText';
import { PUBLIC_SITE_ORIGIN } from '@shared/publicDiscovery';
import { socialCardHref, SOCIAL_CARD_HEIGHT, SOCIAL_CARD_WIDTH } from '@shared/socialCard';
import type { SocialCardInput } from '@shared/socialCard';
import { useEffect } from 'react';

import { pageHead, pageTitle } from './pageTitle';

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

/** One loader result supplies the document identity and social metadata. */
export function publicPageHead({
  name,
  pathname,
  description,
  image,
  imageDetails,
  social,
  match,
}: {
  name: string;
  pathname: string;
  description: string;
  image?: string | null;
  imageDetails?: { alt: string; type: string; width: number; height: number };
  social?: { kind: string; shape: SocialCardInput['shape'] };
  match?: { status: string };
}) {
  if (match?.status === 'notFound') {
    return {};
  }
  const url = new URL(pathname, PUBLIC_SITE_ORIGIN).href;
  const imagePath = social
    ? socialCardHref({ name, description, image, ...social })
    : image || '/video/band-poster.jpg';
  const imageUrl = new URL(imagePath, PUBLIC_SITE_ORIGIN).href;
  const details = social
    ? { alt: name, type: 'image/png', width: SOCIAL_CARD_WIDTH, height: SOCIAL_CARD_HEIGHT }
    : imageDetails;
  return {
    links: [{ rel: 'canonical', href: url }],
    meta: [
      ...pageHead(name).meta!,
      { name: 'description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Dune Zone' },
      { property: 'og:title', content: pageTitle(name) },
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
      { name: 'twitter:title', content: pageTitle(name) },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: imageUrl },
      { name: 'twitter:image:alt', content: details?.alt ?? name },
    ],
  };
}

/** Route heads use their loader seed; the live name owns the tab after hydration. */
export function useLivePageTitle(name: string | undefined) {
  useEffect(() => {
    if (name !== undefined) {
      document.title = pageTitle(name);
    }
  }, [name]);
}
