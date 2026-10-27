import { Button, Group, Menu, Stack, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { Eyebrow } from '@ui/content/Eyebrow';
import { IconAction } from '@ui/control/IconAction';
import { Ellipsis, ExternalLink, UserX } from 'lucide-react';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { SeatAlliance } from './Alliances';

/** What the top of a seat's Faction info shows and offers, ready to lay out. */
export type FactionInfoModel = Readonly<{
  /** The faction's token, as large as the layout asks for. */
  token: (size: number) => ReactNode;
  /** The player, or the faction's name for a vacant seat. */
  name: string;
  faction: string | null;
  seat: string;
  own: boolean;
  alliance: SeatAlliance | null;
  /** The faction's allies as tokens, or the alliance mark. */
  allianceMark: ReactNode;
  page: Readonly<{ href: string; name: string }> | null;
  /** Starting a removal vote against the player, with why it cannot start yet. */
  removal: Readonly<{ start: () => void; disabledReason?: string }> | null;
}>;

export type FactionInfoLayout = 'header' | 'rows' | 'strip' | 'menu';

/** Which layout the Faction info uses; the stories set each in turn while Norbert picks one. */
export const FactionInfoLayoutContext = createContext<FactionInfoLayout>('header');

/** The top of a seat's Faction info, in the layout the context names. */
export function FactionInfoTop({ model }: Readonly<{ model: FactionInfoModel }>) {
  const Layout = LAYOUTS[useContext(FactionInfoLayoutContext)];
  return <Layout model={model} />;
}

type LayoutProps = Readonly<{ model: FactionInfoModel }>;

/* The faction and seat under the name; a vacant seat is named by its faction already, so it gives the seat alone. */
function subtitle({ name, faction, seat }: FactionInfoModel) {
  return [faction !== name && faction, seat].filter(Boolean).join(' · ');
}

function Identity({ model, size }: LayoutProps & Readonly<{ size: number }>) {
  return (
    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
      {model.token(size)}
      <Stack gap={0} style={{ minWidth: 0 }}>
        <Text fw={700} truncate>
          {model.own ? `${model.name} (you)` : model.name}
        </Text>
        <Text size="sm" c="dimmed" truncate>
          {subtitle(model)}
        </Text>
      </Stack>
    </Group>
  );
}

function AllianceLine({ model }: LayoutProps) {
  if (!model.alliance) {
    return null;
  }
  return (
    <Group gap="sm" justify="space-between" wrap="nowrap">
      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
        {model.allianceMark}
        <Text size="sm">{model.alliance.status}</Text>
      </Group>
      {model.alliance.action}
    </Group>
  );
}

function PageLink({
  page,
  ...props
}: Readonly<{ page: NonNullable<FactionInfoModel['page']> }> & Record<string, unknown>) {
  return (
    <Button
      component="a"
      href={page.href}
      target="_blank"
      rel="noreferrer"
      variant="default"
      rightSection={<ExternalLink size={14} aria-hidden />}
      {...props}
    >
      {page.name}
      <VisuallyHidden> page (opens in a new tab)</VisuallyHidden>
    </Button>
  );
}

/* A removal button that stays hoverable while it cannot run, so its tooltip says why. */
function RemovalButton({
  removal,
  ...props
}: Readonly<{ removal: NonNullable<FactionInfoModel['removal']> }> & Record<string, unknown>) {
  const blocked = Boolean(removal.disabledReason);
  return (
    <Tooltip label={removal.disabledReason} disabled={!blocked} withinPortal>
      <Button
        color="red"
        leftSection={<UserX size={14} aria-hidden />}
        data-disabled={blocked || undefined}
        onClick={(event) => (blocked ? event.preventDefault() : removal.start())}
        {...props}
      >
        Start removal vote
      </Button>
    </Tooltip>
  );
}

/** A: the token and name as a header, the page and removal as quiet icon actions beside it, and the alliance in its own row. */
function HeaderLayout({ model }: LayoutProps) {
  return (
    <Stack gap="sm">
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Identity model={model} size={44} />
        <Group gap={4} wrap="nowrap">
          {model.page && (
            <IconAction
              label={`Open the ${model.page.name} page in a new tab`}
              intent="neutral"
              emphasis="quiet"
              icon={<ExternalLink size={16} />}
              href={model.page.href}
              target="_blank"
              rel="noreferrer"
            />
          )}
          {model.removal && (
            <IconAction
              label="Start removal vote"
              intent="negative"
              emphasis="quiet"
              icon={<UserX size={16} />}
              disabledReason={model.removal.disabledReason}
              onClick={model.removal.start}
            />
          )}
        </Group>
      </Group>
      <AllianceLine model={model} />
    </Stack>
  );
}

function LabelledRow({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Group gap="sm" justify="space-between" wrap="nowrap" style={{ minHeight: 30 }}>
      <Eyebrow>{label}</Eyebrow>
      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
        {children}
      </Group>
    </Group>
  );
}

/** B: the token and name as a header, then labelled rows, with the removal vote on its own at the end. */
function RowsLayout({ model }: LayoutProps) {
  return (
    <Stack gap="xs">
      <Identity model={model} size={44} />
      {model.alliance && (
        <LabelledRow label="Alliance">
          {model.allianceMark}
          <Text size="sm">{model.alliance.status}</Text>
        </LabelledRow>
      )}
      {model.alliance && <Group justify="flex-end">{model.alliance.action}</Group>}
      {model.page && (
        <LabelledRow label="Faction">
          <PageLink page={model.page} size="xs" />
        </LabelledRow>
      )}
      {model.removal && <RemovalButton removal={model.removal} variant="light" size="xs" fullWidth />}
    </Stack>
  );
}

/** C: the token and name as a header, the alliance under it, and every action in one strip of equal buttons. */
function StripLayout({ model }: LayoutProps) {
  return (
    <Stack gap="sm">
      <Identity model={model} size={44} />
      {model.alliance && (
        <Group gap="xs" wrap="nowrap">
          {model.allianceMark}
          <Text size="sm">{model.alliance.status}</Text>
        </Group>
      )}
      <Group gap="xs" grow wrap="nowrap">
        {model.alliance?.action}
        {model.page && <PageLink page={model.page} size="xs" />}
        {model.removal && <RemovalButton removal={model.removal} variant="light" size="xs" />}
      </Group>
    </Stack>
  );
}

/** D: the token and name as a header with a ⋯ menu for the page and removal, so only the alliance action shows. */
function MenuLayout({ model }: LayoutProps) {
  const { page, removal } = model;
  return (
    <Stack gap="sm">
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Identity model={model} size={44} />
        {(page || removal) && (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <IconAction label="More" intent="neutral" emphasis="quiet" icon={<Ellipsis size={16} />} />
            </Menu.Target>
            <Menu.Dropdown>
              {page && (
                <Menu.Item
                  component="a"
                  href={page.href}
                  target="_blank"
                  rel="noreferrer"
                  leftSection={<ExternalLink size={14} aria-hidden />}
                >
                  {page.name} page
                </Menu.Item>
              )}
              {page && removal && <Menu.Divider />}
              {removal && (
                <Menu.Item
                  color="red"
                  leftSection={<UserX size={14} aria-hidden />}
                  disabled={Boolean(removal.disabledReason)}
                  onClick={removal.start}
                >
                  Start removal vote
                </Menu.Item>
              )}
              {removal?.disabledReason && (
                <Text size="xs" c="dimmed" px="sm" pb={6} maw={220}>
                  {removal.disabledReason}
                </Text>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
      <AllianceLine model={model} />
    </Stack>
  );
}

const LAYOUTS: Readonly<Record<FactionInfoLayout, (props: LayoutProps) => ReactNode>> = {
  header: HeaderLayout,
  rows: RowsLayout,
  strip: StripLayout,
  menu: MenuLayout,
};
