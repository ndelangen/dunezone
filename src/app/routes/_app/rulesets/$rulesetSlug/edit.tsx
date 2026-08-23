import { Anchor, Button, Center, Group, Image, Popover, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { RULESET_ASSET_SLOT_ORDER, RULESET_ASSET_SLOTS } from '@shared/rulesets/assetSlots';
import type { RulesetAssetSlot } from '@shared/rulesets/assetSlots';
import { rulesetAboutSchema } from '@shared/rulesets/validation';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { rulesetAboutHint } from '@ui/content/rulesetAboutHint';
import { SlugRenameNotice } from '@ui/content/SlugRenameNotice';
import { IconAction } from '@ui/control/IconAction';
import { SubmitAction } from '@ui/control/SubmitAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ArrowLeft, BookOpen, X } from 'lucide-react';
import { useState } from 'react';

import {
  loadRulesetDetailPage,
  useClearRulesetAssetSlot,
  useRulesetDetailPage,
  useSetRulesetAssetSlot,
  useUpdateRuleset,
} from '@db/rulesets';
import type { RulesetEntry } from '@db/rulesets';
import { AssetPicker } from '@app/pickers/AssetPicker';

import styles from './edit.module.css';

function RulesetSettings({ initial, canRename }: { initial: RulesetEntry; canRename: boolean }) {
  const navigate = useNavigate();
  const updateRuleset = useUpdateRuleset();
  const [name, setName] = useState(initial.name);
  const [about, setAbout] = useState(initial.about);
  const [coverUrl, setCoverUrl] = useState(initial.image_cover ?? '');

  const mutationError =
    updateRuleset.isError && updateRuleset.error instanceof Error ? updateRuleset.error.message : null;
  const aboutCheck = rulesetAboutSchema.safeParse(about);
  /**
   * The floor applies to every save, with no exemption for the historical empty string, so that Ruleset cannot be saved until someone writes its About.
   * Shown as an error only once something has been typed;
   * an untouched empty field is explained by the requirement line and the disabled button instead.
   */
  const aboutError = about.trim().length > 0 && !aboutCheck.success ? aboutCheck.error.issues[0]?.message : undefined;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || !aboutCheck.success) {
      return;
    }
    const trimmedCover = coverUrl.trim();
    const previousSlug = initial.slug;
    try {
      const entry = await updateRuleset.mutateAsync({
        id: initial._id,
        input: { name: nextName, about: aboutCheck.data },
        imageCover: trimmedCover === '' ? null : trimmedCover,
      });
      if (previousSlug !== entry.slug) {
        navigate({
          to: '/rulesets/$rulesetSlug/edit',
          params: { rulesetSlug: entry.slug },
          replace: true,
        });
      }
    } catch {
      /* surfaced through mutationError */
    }
  };

  return (
    <Stack component="form" gap="md" onSubmit={handleSubmit}>
      <TextInput
        id="ruleset-settings-name"
        name="name"
        label="Name"
        description={
          canRename ? (
            <SlugRenameNotice noun="ruleset" url={`…/rulesets/${initial.slug}`} />
          ) : (
            'Only the ruleset owner can rename it.'
          )
        }
        required
        minLength={1}
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        disabled={!canRename}
      />

      <Textarea
        id="ruleset-settings-about"
        name="about"
        label="About"
        description={rulesetAboutHint(about)}
        error={aboutError}
        required
        autosize
        minRows={4}
        value={about}
        onChange={(event) => setAbout(event.currentTarget.value)}
      />

      <TextInput
        id="ruleset-settings-cover"
        type="url"
        label="Cover image URL"
        description={
          <>
            Optional. Use a full <code>https://</code> URL. Leave empty to clear the cover.
          </>
        }
        value={coverUrl}
        onChange={(event) => setCoverUrl(event.currentTarget.value)}
        placeholder="https://…"
        autoComplete="off"
      />

      {mutationError ? <FormError title="Ruleset could not be saved">{mutationError}</FormError> : null}

      <Group justify="flex-end">
        <SubmitAction pending={updateRuleset.isPending} disabled={name.trim().length === 0 || !aboutCheck.success}>
          Save changes
        </SubmitAction>
      </Group>
    </Stack>
  );
}

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/edit')({
  loader: async ({ params }) => {
    const detailPage = await loadRulesetDetailPage(params.rulesetSlug);
    if (!detailPage) {
      return { notFound: true as const };
    }
    return { notFound: false as const, detailPage };
  },
  component: RulesetEditPage,
});

function RulesetEditPage() {
  const { rulesetSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const detailSeed = !loaderData.notFound && loaderData.detailPage ? loaderData.detailPage : undefined;
  const pageQuery = useRulesetDetailPage(rulesetSlug, { initialData: detailSeed });
  const page = pageQuery.data;

  const header = page?.ruleset ? (
    <Group wrap="nowrap" align="center" gap="lg" className={styles.pageHead}>
      <Surface>
        {page?.ruleset.image_cover ? (
          <Image
            src={page?.ruleset.image_cover}
            fallbackSrc="/image/background/card-large.jpg"
            alt={`Cover for ${page?.ruleset.name}`}
            className={styles.coverImage}
          />
        ) : (
          <Center h="100%">
            <Text size="xs" c="dimmed" ta="center">
              No cover
            </Text>
          </Center>
        )}
      </Surface>
      <Stack gap={6} className={styles.pageHeadText}>
        <Title order={1} className={styles.rulesetTitle}>
          Edit {page?.ruleset.name}
        </Title>
      </Stack>
    </Group>
  ) : (
    <Title order={1}>Edit ruleset</Title>
  );
  const toolbar = (
    <Surface padding="sm">
      <Group gap="xs" wrap="wrap" role="group" aria-label="Ruleset navigation">
        <IconAction
          label="Back to rulesets"
          variant="light"
          color="gray"
          size="lg"
          renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}
          icon={<ArrowLeft size={17} aria-hidden />}
        />
        {page?.ruleset ? (
          <IconAction
            label="View ruleset"
            variant="light"
            color="gray"
            size="lg"
            renderRoot={(rootProps) => (
              <Link
                {...rootProps}
                to="/rulesets/$rulesetSlug"
                params={{ rulesetSlug: page?.ruleset?.slug ?? rulesetSlug }}
              />
            )}
            icon={<BookOpen size={17} aria-hidden />}
          />
        ) : null}
      </Group>
    </Surface>
  );

  if (loaderData.notFound) {
    return (
      <PageLayout>
        <PageLayout.Header>{header}</PageLayout.Header>
        <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
        <PageLayout.Content>
          <Surface padding="xl">
            <Text>Ruleset not found.</Text>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  if (!page?.ruleset) {
    return (
      <PageLayout>
        <PageLayout.Header>{header}</PageLayout.Header>
        <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
        <PageLayout.Content>
          <Surface padding="xl">
            <Text>Ruleset not found.</Text>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  const r = page.ruleset;
  const viewerAccess = page.viewerAccess;

  if (!viewerAccess) {
    return (
      <PageLayout>
        <PageLayout.Header>{header}</PageLayout.Header>
        <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
        <PageLayout.Content>
          <Surface padding="xl">
            <Text>Loading profile…</Text>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  if (viewerAccess.viewer.kind === 'anonymous') {
    return (
      <PageLayout>
        <PageLayout.Header>{header}</PageLayout.Header>
        <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
        <PageLayout.Content>
          <Surface padding="xl">
            <Text>
              <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to edit this
              ruleset.
            </Text>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  if (!viewerAccess.capabilities.edit) {
    return (
      <PageLayout>
        <PageLayout.Header>{header}</PageLayout.Header>
        <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
        <PageLayout.Content>
          <Surface padding="xl">
            <Text>
              {r.group_id
                ? 'Only the ruleset owner or an active member of its group can edit this ruleset.'
                : 'Only the ruleset owner can edit this ruleset.'}
            </Text>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header>{header}</PageLayout.Header>
      <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="lg">
          <Surface padding="lg">
            <RulesetSettings key={r.slug} initial={r} canRename={viewerAccess.capabilities.rename} />
          </Surface>
          {/* A sibling pane rather than a nested one: surfaces do not nest, and slots are a different subject from the ruleset's own fields. */}
          <Surface padding="lg">
            <RulesetAssetSlots rulesetId={r.id} slots={page.assetSlots} />
          </Surface>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

type SlottedAsset = { id: string; type: string; slug: string; name: string };

/**
 * A ruleset's asset slots.
 *
 * Slots are curatorial labels, so a slot demands only the kind it holds and an empty slot is a legal state rather than a warning.
 * The single-asset slots replace rather than refuse: choosing a second deck for `treachery` swaps it, which is what "at most one" means to someone filling it in.
 */
function RulesetAssetSlots({
  rulesetId,
  slots,
}: {
  rulesetId: string;
  slots: { slot: string; asset: SlottedAsset }[];
}) {
  const setSlot = useSetRulesetAssetSlot();
  const clearSlot = useClearRulesetAssetSlot();
  const [openSlot, setOpenSlot] = useState<RulesetAssetSlot | null>(null);

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={2} size="h4">
          Decks and bundles
        </Title>
        <Text size="sm" c="dimmed">
          What this ruleset ships. Slot names are labels rather than rules, so any deck may fill any deck slot, and an
          empty slot is fine.
        </Text>
      </Stack>
      {setSlot.error ? <FormError title="Slot could not be filled">{setSlot.error.message}</FormError> : null}
      {clearSlot.error ? <FormError title="Slot could not be cleared">{clearSlot.error.message}</FormError> : null}
      {RULESET_ASSET_SLOT_ORDER.map((slot) => {
        const rule = RULESET_ASSET_SLOTS[slot];
        const held = slots.filter((entry) => entry.slot === slot).map((entry) => entry.asset);
        return (
          <Stack key={slot} gap="xs">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text size="sm" fw={600}>
                {rule.label}
              </Text>
              {/* Gated by the popover: the picker subscribes on mount, so it must not mount until asked for. */}
              <Popover
                opened={openSlot === slot}
                onChange={(opened) => setOpenSlot(opened ? slot : null)}
                width={340}
                position="bottom-end"
                withinPortal
              >
                <Popover.Target>
                  <Button
                    variant="light"
                    size="compact-sm"
                    onClick={() => setOpenSlot(openSlot === slot ? null : slot)}
                  >
                    {rule.single && held.length > 0 ? 'Change' : 'Add'}
                  </Button>
                </Popover.Target>
                <Popover.Dropdown>
                  <AssetPicker
                    types={[rule.holds]}
                    excludeIds={held.map((asset) => asset.id)}
                    copy={{
                      searchLabel: `Search ${rule.noun}`,
                      searchPlaceholder: 'Type a name, slug or owner…',
                      emptyMessage: `No ${rule.noun} exist yet.`,
                    }}
                    onPick={(picked) => {
                      setOpenSlot(null);
                      setSlot.mutate({ rulesetId, assetId: picked.id, slot });
                    }}
                    onCancel={() => setOpenSlot(null)}
                  />
                </Popover.Dropdown>
              </Popover>
            </Group>
            {held.length === 0 ? (
              <Text size="sm" c="dimmed">
                Empty.
              </Text>
            ) : (
              <Stack gap={4}>
                {held.map((asset) => (
                  <Group key={asset.id} gap="xs" wrap="nowrap">
                    <Anchor
                      size="sm"
                      style={{ flex: 1, minWidth: 0 }}
                      renderRoot={(rootProps) => (
                        <Link {...rootProps} to="/assets/$type/$slug" params={{ type: asset.type, slug: asset.slug }} />
                      )}
                    >
                      {asset.name}
                    </Anchor>
                    <IconAction
                      label={`Remove ${asset.name} from ${rule.label}`}
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => clearSlot.mutate({ rulesetId, assetId: asset.id, slot })}
                      icon={<X size={15} aria-hidden />}
                    />
                  </Group>
                ))}
              </Stack>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
