import { Avatar, Text } from '@mantine/core';
import preview from '@sb/preview';
import { CheckCircle2, CircleHelp, Layers3 } from 'lucide-react';
import { expect, within } from 'storybook/test';

import { PageLayout } from '../layout/PageLayout';
import { PageIdentity } from './PageIdentity';
import type { PageIdentityProps } from './PageIdentity';

/**
 * The band's ink and treatment come from the header's scheme-pinned paper, so each story mounts the real `PageLayout` and declares a compact header the way the five band pages do.
 */
function InHeader(props: PageIdentityProps) {
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageIdentity {...props} />
      </PageLayout.Header>
      <PageLayout.Content>
        <span />
      </PageLayout.Content>
    </PageLayout>
  );
}

const meta = preview.meta({
  component: PageIdentity,
  parameters: { layout: 'fullscreen' },
  render: (args: PageIdentityProps) => <InHeader {...args} />,
  args: {
    title: 'ClassicRules',
    media: <Avatar name="ClassicRules" radius="md" size="100%" color="dune" />,
    breadcrumb: <PageIdentity.Breadcrumb to="/rulesets">Rulesets</PageIdentity.Breadcrumb>,
    children: <Text size="sm">Maintained by the Arrakeen Rules Council</Text>,
  },
});

/**
 * The full band: media, breadcrumb, name, and a meta line, in the pinned paper ink.
 *
 * The breadcrumb is sized by its word rather than by the column it sits in.
 * The column is a flex column, so without that the anchor stretched the full width and a click on empty band navigated: 628px of hit area for one word on the ruleset page.
 */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const band = within(canvasElement);
    const crumb = await band.findByRole('link', { name: 'Rulesets' });
    const column = crumb.parentElement ?? crumb;
    expect(crumb.getBoundingClientRect().width).toBeLessThan(column.getBoundingClientRect().width);
  },
});

/**
 * The meta line every detail page shares, in its fixed order: who maintains it, where the viewer stands, the page's own extras, then the counts.
 * The ruleset page is the reference;
 * the others fill the same slots with their own facts.
 */
export const DetailPage = meta.story({
  args: {
    children: undefined,
    maintainers: {
      owner: { slug: 'norbert', name: 'Norbert', image: null },
      group: { slug: 'arrakeen-rules-council', name: 'Arrakeen Rules Council' },
    },
    standing: { tone: 'positive', label: 'Member' },
    stats: [
      { key: 'factions', icon: <Layers3 size={17} aria-hidden />, value: 6, label: '6 factions' },
      { key: 'questions', icon: <CircleHelp size={17} aria-hidden />, value: 12, label: '12 questions' },
      { key: 'answered', icon: <CheckCircle2 size={17} aria-hidden />, value: 9, label: '9 answered questions' },
    ],
  },
  play: async ({ canvasElement }) => {
    const band = within(canvasElement);
    await expect(band.findByText('Maintained by')).resolves.toBeVisible();
    await expect(band.findByRole('link', { name: /Arrakeen Rules Council/ })).resolves.toBeVisible();
    await expect(band.findByText('Member')).resolves.toBeVisible();
  },
});

/** A kind that groups can maintain, with none assigned, says so rather than leaving a gap. */
export const WithoutMaintainingGroup = meta.story({
  args: {
    children: undefined,
    maintainers: { owner: { slug: 'norbert', name: 'Norbert', image: null }, group: null },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).findByText('No maintaining group')).resolves.toBeVisible();
  },
});

/** A page with no identity media: the text column keeps its edge and the name leads. */
export const WithoutMedia = meta.story({
  args: { media: undefined },
});

/** The top of a branch has no way up, so the name sits first in the column. */
export const WithoutBreadcrumb = meta.story({
  args: { breadcrumb: undefined },
});
