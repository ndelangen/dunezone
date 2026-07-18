import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { RotateCcw, Save, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { type Faction, type FactionEntry, useCreateFaction } from '@db/factions';
import { useCurrentProfile } from '@db/profiles';
import {
  FactionEditor,
  type FactionEditorHandle,
} from '@app/components/factions/editor/FactionEditor';
import { FactionLoadPopover } from '@app/components/factions/editor/FactionLoadPopover';
import { FormTooltip } from '@app/components/form/FormTooltip';
import { Toolbar } from '@app/components/generic/layout';
import { Card } from '@app/components/generic/surfaces/Card';
import { UIButton } from '@app/components/generic/ui/UIButton';
import { PageLayout } from '@app/components/shell';
import { defaultFaction } from '@data/defaultFaction';
import { FactionInputSchema, factionSlugBaseFromName } from '@game/schema/faction';

export const Route = createFileRoute('/_app/factions/create')({
  component: CreateFactionPage,
});

const factionCreateHeader = <h1>Create faction</h1>;

function toSyntheticFactionEntry(
  defaultFactionData: typeof defaultFaction,
  ownerId: string
): FactionEntry {
  // Minimal synthetic entry; slug is derived from name.
  return {
    _id: 'new' as never,
    _creationTime: Date.now(),
    owner_id: ownerId as never,
    data: { ...defaultFactionData },
    slug: factionSlugBaseFromName(defaultFactionData.name ?? ''),
    group_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_deleted: false,
  };
}

function formatZodIssues(err: { issues: readonly { path: PropertyKey[]; message: string }[] }) {
  return err.issues
    .map((i) => `${i.path.map((segment) => String(segment)).join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

function CreateFactionPage() {
  const profile = useCurrentProfile();
  const ownerUserId = profile.data?.user_id;
  const navigate = useNavigate();
  const createFaction = useCreateFaction();
  const editorRef = useRef<FactionEditorHandle | null>(null);
  const [editorErrors, setEditorErrors] = useState<string[]>([]);

  if (!ownerUserId) {
    return (
      <PageLayout header={factionCreateHeader}>
        <Card>
          <p>
            <Link to="/auth/login">Log in</Link> to create a faction.
          </p>
          <p>
            <Link to="/factions">Back to factions</Link>
          </p>
        </Card>
      </PageLayout>
    );
  }

  const syntheticEntry = toSyntheticFactionEntry(defaultFaction, ownerUserId);

  const handleEditorSubmit = (values: Faction) => {
    const parsed = FactionInputSchema.safeParse(values);
    if (!parsed.success) {
      setEditorErrors([formatZodIssues(parsed.error)]);
      return;
    }
    setEditorErrors([]);
    void (async () => {
      const entry = await createFaction.mutateAsync({ input: parsed.data, groupId: null });
      navigate({
        to: '/factions/$factionId/edit',
        params: { factionId: entry.slug },
      });
    })();
  };

  return (
    <PageLayout
      header={factionCreateHeader}
      toolbar={
        <Toolbar>
          <Toolbar.Left>
            <FormTooltip content="Save changes">
              <UIButton
                type="button"
                iconOnly
                aria-label="Save changes"
                disabled={false}
                onClick={() => editorRef.current?.submit()}
              >
                <Save size={16} aria-hidden />
              </UIButton>
            </FormTooltip>
            <FactionLoadPopover
              disabled={false}
              currentPublicSlug={syntheticEntry.slug}
              onLoaded={(loaded) => {
                editorRef.current?.load(loaded);
              }}
            />
            <FormTooltip content="Reset unsaved edits">
              <UIButton
                type="button"
                variant="critical"
                iconOnly
                aria-label="Reset unsaved edits"
                disabled={false}
                onClick={() => editorRef.current?.load()}
              >
                <RotateCcw size={16} aria-hidden />
              </UIButton>
            </FormTooltip>
          </Toolbar.Left>

          <Toolbar.Right>
            <p>You'll be able to assign it to a group after the first save.</p>
            <FormTooltip content="Close editor">
              <UIButton
                type="button"
                variant="critical"
                iconOnly
                aria-label="Close editor"
                disabled={false}
                onClick={() => navigate({ to: '/factions' })}
              >
                <X size={16} aria-hidden />
              </UIButton>
            </FormTooltip>
          </Toolbar.Right>
        </Toolbar>
      }
    >
      <FactionEditor
        key="create"
        ref={editorRef}
        factionEntry={syntheticEntry}
        errors={editorErrors}
        onSubmit={handleEditorSubmit}
      />
    </PageLayout>
  );
}
