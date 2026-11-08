import { createFileRoute, notFound } from '@tanstack/react-router';

import { pageHead } from '@app/routes/pageTitle';
import { publicPageHead } from '@app/routes/publicPage';
import { ToolPlaceholder } from '@app/widgets/tool-catalogue/ToolPlaceholder';

import { TOOL_SUGGEST_HREF, toolAt, toolIssueHref } from './tools';

/*
 * A planned tool's address, holding its placeholder until the tool is built.
 * A built tool has its own static route at the same address, which wins over this one; an unknown or built slug here is the router's 404.
 * Placeholders stay out of search (noindex) and the sitemap, so only finished tools are indexed.
 */
export const Route = createFileRoute('/_app/tools/$tool')({
  ssr: true,
  beforeLoad: ({ params }) => {
    const tool = toolAt(params.tool);
    if (!tool || tool.page) {
      throw notFound();
    }
  },
  head: ({ params, match }) => {
    const tool = toolAt(params.tool);
    if (!tool) {
      return pageHead('Tools', { noindex: true, match });
    }
    const head = publicPageHead({
      name: tool.title,
      kind: 'Tools',
      pathname: `/tools/${tool.slug}`,
      description: tool.statement,
      trail: [{ name: 'Tools', pathname: '/tools' }],
      match,
    });
    return { ...head, meta: [...(head.meta ?? []), { name: 'robots', content: 'noindex' }] };
  },
  component: ToolPlaceholderPage,
});

function ToolPlaceholderPage() {
  const { tool: slug } = Route.useParams();
  const tool = toolAt(slug)!;
  return (
    <ToolPlaceholder
      title={tool.title}
      statement={tool.statement}
      capabilities={tool.capabilities}
      followHref={tool.issue === undefined ? undefined : toolIssueHref(tool.issue)}
      suggestHref={TOOL_SUGGEST_HREF}
    />
  );
}
