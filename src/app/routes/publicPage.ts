import { parseFormattedText } from '@shared/formattedText';
import type { FormattedTextInlineNode } from '@shared/formattedText';
import { socialCardHref, SOCIAL_CARD_HEIGHT, SOCIAL_CARD_WIDTH } from '@shared/socialCard';
import type { SocialCardInput } from '@shared/socialCard';
import { useEffect } from 'react';

import { pageHead, pageTitle } from './pageTitle';

const SITE_ORIGIN = 'https://dune.zone';

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
  social,
  match,
}: {
  name: string;
  pathname: string;
  description: string;
  image?: string | null;
  social?: { kind: string; shape: SocialCardInput['shape'] };
  match?: { status: string };
}) {
  if (match?.status === 'notFound') {
    return {};
  }
  const url = new URL(pathname, SITE_ORIGIN).href;
  const imagePath = social
    ? socialCardHref({ name, description, image, ...social })
    : image || '/video/band-poster.jpg';
  const imageUrl = new URL(imagePath, SITE_ORIGIN).href;
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
      { property: 'og:image:alt', content: name },
      ...(social
        ? [
            { property: 'og:image:type', content: 'image/png' },
            { property: 'og:image:width', content: String(SOCIAL_CARD_WIDTH) },
            { property: 'og:image:height', content: String(SOCIAL_CARD_HEIGHT) },
          ]
        : []),
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: pageTitle(name) },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: imageUrl },
      { name: 'twitter:image:alt', content: name },
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
