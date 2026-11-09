import { useAuthActions } from '@convex-dev/auth/react';
import { Box, Center, Group, Image, Radio, Select, Stack, Text, TextInput, VisuallyHidden } from '@mantine/core';
import { profileSlugBaseFromName, profileUserEditFormSchema } from '@shared/profiles/validation';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import { PageState } from '@ui/block/PageState';
import { NameDisc } from '@ui/content/NameDisc';
import { Pending } from '@ui/content/Pending';
import { SlugRenameNotice } from '@ui/content/SlugRenameNotice';
import { StatusBadge } from '@ui/content/StatusBadge';
import { ControlBlock } from '@ui/control/ControlBlock';
import { HoldAction } from '@ui/control/HoldAction';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  ArrowLeft,
  Check,
  CircleUserRound,
  Link2,
  LogIn,
  LogOut,
  Palette,
  RefreshCw,
  Save,
  Trash2,
  Unlink,
  UsersRound,
} from 'lucide-react';
import { useId, useLayoutEffect, useReducer, useRef, useState } from 'react';

import { authProviderNames } from '@db/accounts';
import {
  holdAuthConnection,
  needsRecentSignIn,
  useApplyLinkedAccount,
  useBeginAuthConnection,
  useProviderSignIn,
  useDisconnectAuthMethod,
  useResyncLinkedAccounts,
  useSignOutEverywhere,
} from '@db/accounts';
import type { AuthProvider, LinkedAccountApplied, LinkedAccountOption, LinkedAccountResync } from '@db/accounts';
import { useProfileSettings, useSessionViewer, useUpdateCurrentProfile } from '@db/profiles';
import type { CurrentProfileEntry, ProfileSettingsData, ProfileUserEditInput } from '@db/profiles';
import { pageHead } from '@app/routes/pageTitle';
import { setMotionOverride, useMotionPreference } from '@app/styles/motion';
import type { MotionPreference } from '@app/styles/motion';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { RoutePending } from '@app/widgets/page-message/RoutePending';

import { SignInAgainAction } from './SignInAgainAction';

const PROFILE_TABS = ['profile', 'defaults', 'appearance', 'sign-in', 'account'] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

function isProfileTab(value: unknown): value is ProfileTab {
  return typeof value === 'string' && (PROFILE_TABS as readonly string[]).includes(value);
}

/** The settings page open on one of its tabs, as a link names it: the return from a re-sign-in lands on Sign-in methods. */
function settingsTabPath(profileSlug: string, tab: ProfileTab): string {
  return `/profiles/${encodeURIComponent(profileSlug)}/edit?tab=${tab}`;
}

type ProfileDraft = {
  username: string;
  avatarUrl: string;
  bggProfileUrl: string;
  /* The raw column now, not the sanitized projection: `session` no longer joins memberships.
     A default pointing at a Group the viewer left is corrected by derivation once the options land. */
  defaultGroupId: string | null;
  /* Declared intent (D4): the id alone cannot say whether an unchanged value was chosen or inherited. */
  defaultGroupChanged: boolean;
};

type ProfileEditState = {
  data: ProfileDraft;
  baseline: { username: string; avatarUrl: string; bggProfileUrl: string };
};

type ProfileEditEvent =
  | { kind: 'patch'; update: Partial<ProfileDraft> }
  | {
      kind: 'saved';
      entry: { username: string; avatarUrl: string; bggProfileUrl: string; defaultGroupId: string | null };
    }
  /* A sign-in method's name and picture landed on the profile; the other fields keep whatever the reader typed. */
  | { kind: 'resynced'; username: string; avatarUrl: string };

function openingState(initial: {
  username: string;
  avatarUrl: string;
  bggProfileUrl: string;
  defaultGroupId: string | null;
}): ProfileEditState {
  return {
    data: { ...initial, defaultGroupChanged: false },
    baseline: { username: initial.username, avatarUrl: initial.avatarUrl, bggProfileUrl: initial.bggProfileUrl },
  };
}

function reduceProfileEdit(state: ProfileEditState, event: ProfileEditEvent): ProfileEditState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'saved':
      return openingState(event.entry);
    case 'resynced':
      return {
        data: { ...state.data, username: event.username, avatarUrl: event.avatarUrl },
        baseline: { ...state.baseline, username: event.username, avatarUrl: event.avatarUrl },
      };
  }
}
type LoadedAvatarPreview = { url: string; status: 'ready' | 'unavailable' };

function parseAvatarPreviewUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function AvatarPreview({ avatarUrl, username }: { avatarUrl: string; username: string }) {
  const [loaded, setLoaded] = useState<LoadedAvatarPreview | null>(null);
  const trimmed = avatarUrl.trim();
  const previewUrl = parseAvatarPreviewUrl(avatarUrl);
  const status =
    trimmed.length === 0
      ? 'empty'
      : previewUrl === null
        ? 'invalid'
        : loaded?.url === previewUrl
          ? loaded.status
          : 'loading';

  const message =
    status === 'empty'
      ? 'Enter an avatar URL to see a preview.'
      : status === 'invalid'
        ? 'Enter a valid https:// image URL.'
        : status === 'loading'
          ? 'Loading avatar preview...'
          : status === 'unavailable'
            ? 'This image could not be loaded.'
            : null;

  return (
    <Stack gap="xs">
      <Text fw={650}>Avatar preview</Text>
      <Box pos="relative" mih={220}>
        {previewUrl ? (
          <Image
            key={previewUrl}
            src={previewUrl}
            alt={status === 'ready' ? 'Avatar preview for ' + (username || 'this profile') : ''}
            fit="contain"
            h={220}
            w="100%"
            radius="sm"
            style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}
            onLoad={() => setLoaded({ url: previewUrl, status: 'ready' })}
            onError={() => setLoaded({ url: previewUrl, status: 'unavailable' })}
          />
        ) : null}
        {message ? (
          <Center pos="absolute" style={{ inset: 0 }}>
            <Text
              c={status === 'invalid' || status === 'unavailable' ? 'red' : 'dimmed'}
              role={status === 'invalid' || status === 'unavailable' ? 'alert' : 'status'}
              ta="center"
            >
              {message}
            </Text>
          </Center>
        ) : null}
      </Box>
    </Stack>
  );
}

function PreferenceChoices<Value extends string>({
  label,
  note,
  options,
  value,
  onChange,
}: {
  label: string;
  note: string;
  options: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (next: Value) => void;
}) {
  return (
    <ControlBlock
      title={label}
      description={note}
      input={
        <Radio.Group
          label={<VisuallyHidden>{label}</VisuallyHidden>}
          value={value}
          onChange={(next) => onChange(next as Value)}
        >
          <Group gap="lg" wrap="wrap">
            {options.map(({ value, label }) => (
              <Radio key={value} value={value} label={label} />
            ))}
          </Group>
        </Radio.Group>
      }
    />
  );
}

function EditableProfilePage({ initial, initialTab }: { initial: CurrentProfileEntry; initialTab: ProfileTab }) {
  const navigate = useNavigate();
  const update = useUpdateCurrentProfile();
  const formId = 'profile-settings-' + useId().replaceAll(':', '');
  const usernameRef = useRef<HTMLInputElement>(null);
  const avatarUrlRef = useRef<HTMLInputElement>(null);
  const bggProfileUrlRef = useRef<HTMLInputElement>(null);
  const defaultGroupRef = useRef<HTMLInputElement>(null);
  /* The address only chooses the opening tab; switching tabs stays on the page and leaves the address alone. */
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
  const [state, dispatch] = useReducer(
    reduceProfileEdit,
    {
      username: initial.username ?? '',
      avatarUrl: initial.avatar_url ?? '',
      bggProfileUrl: initial.bgg_profile_url ?? '',
      defaultGroupId: initial.default_group_id ?? null,
    },
    openingState
  );
  const { username, avatarUrl, bggProfileUrl, defaultGroupChanged } = state.data;
  const settings = useProfileSettings().data;
  const defaultGroupOptions = settings?.default_group_options;
  /* Derived, not resynced: a default pointing at a Group the viewer left reads as none once the
     options land, and the same derivation is what a save submits. Until the options land the stored
     value stands, since not-yet-loaded is not the same as "you are in no Groups". */
  const defaultGroupId =
    defaultGroupOptions === undefined ||
    state.data.defaultGroupId === null ||
    defaultGroupOptions.some((group) => group.id === state.data.defaultGroupId)
      ? state.data.defaultGroupId
      : null;
  const motion = useMotionPreference();

  const mutationError = update.isError && update.error instanceof Error ? update.error.message : null;
  const isDirty =
    username !== state.baseline.username ||
    avatarUrl !== state.baseline.avatarUrl ||
    bggProfileUrl !== state.baseline.bggProfileUrl ||
    defaultGroupChanged;

  const slugPreview = (() => {
    try {
      return profileSlugBaseFromName(username);
    } catch {
      return null;
    }
  })();

  const draftInput: ProfileUserEditInput = {
    username,
    avatar_url: avatarUrl,
    ...(bggProfileUrl !== state.baseline.bggProfileUrl ? { bgg_profile_url: bggProfileUrl } : {}),
    ...(defaultGroupChanged ? { default_group_id: defaultGroupId } : {}),
  };
  const draftCheck = profileUserEditFormSchema.safeParse(draftInput);
  const warnings = draftCheck.success
    ? []
    : draftCheck.error.issues.map((issue) => {
        const field = issue.path[0] as keyof ProfileUserEditInput | undefined;
        const source =
          field === 'default_group_id'
            ? 'Default Group'
            : field === 'avatar_url'
              ? 'Avatar image URL'
              : field === 'bgg_profile_url'
                ? 'BoardGameGeek profile URL'
                : 'Display name';
        return { source, complaint: issue.message, field };
      });

  const focusInvalidField = (field: keyof ProfileUserEditInput | undefined) => {
    setActiveTab(field === 'default_group_id' ? 'defaults' : 'profile');
    requestAnimationFrame(() => {
      const fieldRef =
        field === 'default_group_id'
          ? defaultGroupRef
          : field === 'avatar_url'
            ? avatarUrlRef
            : field === 'bgg_profile_url'
              ? bggProfileUrlRef
              : usernameRef;
      fieldRef.current?.focus();
    });
  };

  const header = useEditPageHeader({
    warnings,
    onFocusWarning: (warning) => focusInvalidField(warning.field),
  });
  const commitSaved = header.releasing(
    (entry: { username: string; avatarUrl: string; bggProfileUrl: string; defaultGroupId: string | null }) =>
      dispatch({ kind: 'saved', entry })
  );

  const [resync, dispatchResync] = useReducer(reduceResync, { busy: null, error: null, outcome: { kind: 'idle' } });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    /* A save over a resync in flight would put the draft's old picture back over the one just taken. */
    if (update.isPending || resync.busy !== null) {
      return;
    }
    if (!draftCheck.success) {
      focusInvalidField(warnings[0]?.field);
      return;
    }

    const previousSlug = initial.slug;
    update.mutate(
      { input: draftCheck.data },
      {
        onSuccess: (entry, _variables, defaultGroupUnavailable) => {
          commitSaved({
            username: entry.username ?? '',
            avatarUrl: entry.avatar_url ?? '',
            bggProfileUrl: entry.bgg_profile_url ?? '',
            defaultGroupId: entry.default_group_id ?? null,
          });

          if (defaultGroupUnavailable) {
            window.alert('Profile saved, but the selected default Group was no longer available.');
          }
          if (previousSlug !== entry.slug) {
            void navigate({
              to: '/profiles/$profileSlug',
              params: { profileSlug: entry.slug },
              replace: true,
            });
          }
        },
      }
    );
  };

  /*
   * A resync changes the name and picture outside the form, so those two fields take the result as saved;
   * an edit to the other fields stays unsaved. A new address follows on its own, once the page learns of it.
   */
  const resynced = header.releasing((applied: LinkedAccountApplied) =>
    dispatch({
      kind: 'resynced',
      username: applied.profile.username ?? '',
      avatarUrl: applied.profile.avatar_url ?? '',
    })
  );
  const resyncLinked = useResyncLinkedAccounts();
  const applyLinked = useApplyLinkedAccount();
  const runResync = async () => {
    dispatchResync({ kind: 'started', action: 'resync' });
    try {
      const result = await resyncLinked({});
      dispatchResync({ kind: 'resynced', result });
      if (result.kind === 'applied') {
        resynced(result.applied);
      }
    } catch (error) {
      dispatchResync({
        kind: 'failed',
        error,
        fallback: 'The sign-in methods could not be asked for a name and picture.',
      });
    }
    dispatchResync({ kind: 'settled' });
  };
  const chooseLinked = async (provider: AuthProvider) => {
    dispatchResync({ kind: 'started', action: 'apply' });
    try {
      const applied = await applyLinked({ provider });
      dispatchResync({ kind: 'applied', applied });
      resynced(applied);
    } catch (error) {
      dispatchResync({ kind: 'failed', error, fallback: 'The name and picture could not be taken.' });
    }
    dispatchResync({ kind: 'settled' });
  };
  const merging = settings?.account?.merging ?? false;

  const panelError = <ActionError subject="Profile" verb="save" error={mutationError} />;

  const tabs = [
    {
      value: 'profile',
      label: 'Profile',
      icon: <CircleUserRound size={20} />,
      panel: (
        <Stack gap="md">
          {panelError}
          <ControlBlock
            title="Display name *"
            description={
              <>
                Letters and numbers only, 5–30 characters, not all capitals.
                {slugPreview ? (
                  <>
                    {'\n'}
                    <SlugRenameNotice
                      noun="profile"
                      url={'…/profiles/' + slugPreview}
                      note="A taken id gets a number added."
                    />
                  </>
                ) : null}
              </>
            }
            input={
              <TextInput
                ref={usernameRef}
                aria-label="Display name"
                required
                value={username}
                onChange={(event) => dispatch({ kind: 'patch', update: { username: event.target.value } })}
                autoComplete="nickname"
                maxLength={30}
              />
            }
          />
          <ControlBlock
            title="Avatar image URL *"
            description={
              <>
                Must be a full <code>https://</code> URL.
              </>
            }
            input={
              <TextInput
                ref={avatarUrlRef}
                aria-label="Avatar image URL"
                required
                type="url"
                value={avatarUrl}
                onChange={(event) => dispatch({ kind: 'patch', update: { avatarUrl: event.target.value } })}
                placeholder="https://…"
                autoComplete="off"
              />
            }
          />
          <ControlBlock
            title="BoardGameGeek profile URL"
            description={
              'A public link; ownership is not verified, so it cannot sign you in.\nClear it and save to remove it.'
            }
            input={(fieldProps) => (
              <TextInput
                {...fieldProps}
                ref={bggProfileUrlRef}
                type="url"
                value={bggProfileUrl}
                onChange={(event) => dispatch({ kind: 'patch', update: { bggProfileUrl: event.target.value } })}
                placeholder="https://boardgamegeek.com/user/yourname"
                autoComplete="off"
                maxLength={500}
              />
            )}
          />
          <AvatarPreview avatarUrl={avatarUrl} username={username} />
        </Stack>
      ),
    },
    {
      value: 'defaults',
      label: 'Creation defaults',
      icon: <UsersRound size={20} />,
      panel: (
        <Stack gap="md">
          {panelError}
          <ControlBlock
            title="Default Group"
            description={
              'New rulesets and factions start in this Group.\nYou can change an item’s Group after its first save.'
            }
            input={(fieldProps) => (
              <Select
                {...fieldProps}
                ref={defaultGroupRef}
                disabled={defaultGroupOptions === undefined}
                value={defaultGroupId ?? ''}
                onChange={(value) =>
                  dispatch({ kind: 'patch', update: { defaultGroupId: value || null, defaultGroupChanged: true } })
                }
                data={[
                  { value: '', label: 'No default Group' },
                  ...(defaultGroupOptions ?? []).map((group) => ({ value: group.id, label: group.name })),
                ]}
                clearable
              />
            )}
          />
        </Stack>
      ),
    },
    {
      value: 'appearance',
      label: 'Appearance',
      icon: <Palette size={20} />,
      panel: (
        <Stack gap="xl">
          {panelError}
          <PreferenceChoices<MotionPreference>
            label="Ambient motion"
            note="The masthead video, rotating planet and stars"
            options={[
              { value: 'system', label: 'System' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
            value={motion}
            onChange={(next) => setMotionOverride(next === 'system' ? null : next)}
          />
        </Stack>
      ),
    },
    {
      value: 'sign-in',
      label: 'Sign-in methods',
      icon: <Link2 size={20} />,
      panel: (
        <Stack gap="md">
          {panelError}
          {settings === undefined ? (
            <PageState kind="pending" title="Loading sign-in methods">
              Checking your connected accounts.
            </PageState>
          ) : settings.account ? (
            <SignInMethods
              account={settings.account}
              returnTo={settingsTabPath(initial.slug, 'sign-in')}
              resync={resync}
              saving={update.isPending}
              onTake={(provider) => void chooseLinked(provider)}
            />
          ) : (
            <PageState kind="absent" title="Sign-in methods unavailable">
              Sign in again to manage your account.
            </PageState>
          )}
        </Stack>
      ),
    },
    {
      value: 'account',
      label: 'Account',
      icon: <Trash2 size={20} />,
      panel: (
        <Stack gap="md" align="flex-start">
          {/* Save is reachable from every tab through the toolbar, so its failure must be visible on every tab too. */}
          {panelError}
          <ControlBlock
            title="Delete account"
            description="Review your direct ownership and choose what happens to it on a dedicated page."
            input={
              <IconAction
                label="Delete account"
                emphasis="standard"
                intent="neutral"
                size="lg"
                icon={<Trash2 size={17} aria-hidden />}
                renderRoot={(rootProps) => (
                  <Link {...rootProps} to="/profiles/$profileSlug/delete" params={{ profileSlug: initial.slug }} />
                )}
              />
            }
          />
        </Stack>
      ),
    },
  ] as const;

  const toolbar = (
    <Toolbar>
      <Toolbar.Left label="Navigation">
        {/* Back returns to the profile these settings belong to, the page Edit came from. */}
        <IconAction
          label="Back to profile"
          emphasis="standard"
          intent="neutral"
          size="lg"
          renderRoot={(rootProps) => (
            <Link {...rootProps} to="/profiles/$profileSlug" params={{ profileSlug: initial.slug }} />
          )}
          icon={<ArrowLeft size={17} aria-hidden />}
        />
      </Toolbar.Left>
      <Toolbar.Right label="Editing actions">
        <Toolbar.Cluster kind="content">
          <IconAction
            label="Resync name and picture"
            tooltip={
              'Resync name and picture from your sign-in methods.\nSteam is asked now; Google and Discord offer what they sent at your last sign-in.\nOne method applies at once; with several you pick one.'
            }
            emphasis="standard"
            intent="neutral"
            size="lg"
            loading={resync.busy === 'resync'}
            disabledReason={
              settings === undefined
                ? 'Your sign-in methods are still loading.'
                : merging
                  ? 'Sign-in methods are locked while the profile merge runs.'
                  : update.isPending
                    ? 'The profile is still being saved.'
                    : resync.busy === 'apply'
                      ? 'A pick is still being taken.'
                      : undefined
            }
            onClick={() => {
              /* The answer lands on each method's row, so the tab that holds them opens first. */
              setActiveTab('sign-in');
              header.settle();
              void runResync();
            }}
            icon={<RefreshCw size={17} aria-hidden />}
          />
        </Toolbar.Cluster>
        <Toolbar.Cluster kind="commit">
          <IconAction
            label="Save profile"
            emphasis="strong"
            intent="positive"
            size="lg"
            type="submit"
            form={formId}
            loading={update.isPending}
            disabled={!isDirty || update.isPending || resync.busy !== null}
            icon={<Save size={17} aria-hidden />}
          />
        </Toolbar.Cluster>
      </Toolbar.Right>
    </Toolbar>
  );

  return (
    <PageLayout>
      {header.slot}
      <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
      <PageLayout.Content>
        <form id={formId} onSubmit={handleSubmit} onBlurCapture={header.settle}>
          <ConnectedTabs
            value={activeTab}
            onValueChange={(next) => {
              setActiveTab(next);
              header.settle();
            }}
            ariaLabel="Profile settings sections"
            items={tabs}
          />
        </form>
      </PageLayout.Content>
    </PageLayout>
  );
}

export const Route = createFileRoute('/_app/profiles/$profileSlug/edit')({
  head: () => pageHead('Profile settings'),
  /* `tab` opens the page on one of its tabs, so a return from a re-sign-in lands where the reader was; anything else opens on Profile. */
  validateSearch: (search: Record<string, unknown>): { tab?: ProfileTab } =>
    isProfileTab(search.tab) ? { tab: search.tab } : {},
  component: ProfileSettingsPage,
});

function ProfileSettingsPage() {
  const { profileSlug } = Route.useParams();
  const { tab = 'profile' } = Route.useSearch();
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const viewerSlug = viewer.kind === 'profile' ? viewer.profile.slug : null;
  /*
   * A rename the page did not submit, a resync for one, changes the address while the reader is on it.
   * The address the page opened on is remembered, so that one mismatch is followed to the new address instead of being read as somebody else's profile.
   */
  const [openedOn, setOpenedOn] = useState<string | null>(() => (viewerSlug === profileSlug ? profileSlug : null));
  if (viewerSlug === profileSlug && openedOn !== profileSlug) {
    /* Remembered during render, as soon as the address and the profile agree, so a later mismatch is judged against it at once. */
    setOpenedOn(profileSlug);
  }
  const renamed = viewerSlug !== null && viewerSlug !== profileSlug && openedOn === profileSlug;
  useLayoutEffect(() => {
    if (renamed) {
      void navigate({
        to: '/profiles/$profileSlug/edit',
        params: { profileSlug: viewerSlug },
        search: true,
        replace: true,
      });
    }
  }, [navigate, renamed, viewerSlug]);

  switch (viewer.kind) {
    case 'pending':
      return (
        <RoutePending
          title="Profile settings"
          back={<PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>}
          loading="Loading your profile"
        >
          Checking whether you are signed in.
        </RoutePending>
      );
    case 'signed-out':
      return (
        <PageMessage
          title="Profile settings"
          back={<PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>}
        >
          <LoginGate action="edit your profile" />
        </PageMessage>
      );
    default:
      break;
  }

  /* While the address catches up with a rename, the editor stays as it is: the route is the same, so its tab and its answer survive the new address. */
  if (!renamed && viewer.profile.slug !== profileSlug) {
    /* The way out is the reader's own settings rather than a step backwards: they asked for this
       page and there is a version of it that is theirs. */
    return (
      <PageMessage
        title="Profile settings"
        back={
          <PageMessage.Back to="/profiles/$profileSlug/edit" params={{ profileSlug: viewer.profile.slug }}>
            Go to your profile settings
          </PageMessage.Back>
        }
      >
        <PageState kind="absent" title="This is not your profile">
          You can only edit your own profile.
        </PageState>
      </PageMessage>
    );
  }

  /* Keyed by the profile, not its address: a rename from the Sign-in methods tab keeps the tab and its answer on screen. */
  return <EditableProfilePage key={viewer.profile._id} initial={viewer.profile} initialTab={tab} />;
}

/* The tab's one busy action: a provider being connected or disconnected, or the sign-out of every session. */
type SignInMethodsAction = AuthProvider | 'everywhere';
/* The failure is kept as thrown, since a refusal that asks for a fresh sign-in is told apart by its data, not its words. */
type SignInMethodsState = { busy: SignInMethodsAction | null; error: Error | string | null };
type SignInMethodsEvent =
  | { kind: 'started'; provider: SignInMethodsAction }
  | { kind: 'failed'; error: unknown; fallback: string }
  | { kind: 'settled' };

function reduceSignInMethods(state: SignInMethodsState, event: SignInMethodsEvent): SignInMethodsState {
  switch (event.kind) {
    case 'started':
      return { busy: event.provider, error: null };
    case 'failed':
      return { ...state, error: event.error instanceof Error ? event.error : event.fallback };
    case 'settled':
      return { ...state, busy: null };
  }
}

/*
 * Where the resync stands: not asked, offering a choice, finding nothing to take, or done.
 * Done is the end of it: the rows show no offers any more, and one line says what the profile took.
 */
type ResyncOutcome =
  | Exclude<LinkedAccountResync, { kind: 'applied' }>
  | { kind: 'idle' }
  | { kind: 'done'; applied: LinkedAccountApplied };
type ResyncState = { busy: 'resync' | 'apply' | null; error: Error | string | null; outcome: ResyncOutcome };
type ResyncEvent =
  | { kind: 'started'; action: 'resync' | 'apply' }
  | { kind: 'failed'; error: unknown; fallback: string }
  | { kind: 'resynced'; result: LinkedAccountResync }
  | { kind: 'applied'; applied: LinkedAccountApplied }
  | { kind: 'settled' };

function reduceResync(state: ResyncState, event: ResyncEvent): ResyncState {
  switch (event.kind) {
    case 'started':
      /* A new resync clears the last answer; a pick from the list keeps the list until its answer lands. */
      return {
        ...state,
        busy: event.action,
        error: null,
        ...(event.action === 'resync' ? { outcome: { kind: 'idle' } } : {}),
      };
    case 'failed':
      return { ...state, error: event.error instanceof Error ? event.error : event.fallback };
    case 'resynced':
      return {
        ...state,
        outcome: event.result.kind === 'applied' ? { kind: 'done', applied: event.result.applied } : event.result,
      };
    case 'applied':
      return { ...state, outcome: { kind: 'done', applied: event.applied } };
    case 'settled':
      return { ...state, busy: null };
  }
}

/** What the profile took from a method, in a sentence. */
function appliedWords(applied: LinkedAccountApplied): string {
  const from = authProviderNames[applied.provider];
  if (applied.name && applied.avatar) {
    return `Name and picture updated from ${from}.`;
  }
  if (applied.name) {
    return `Name updated from ${from}. Its picture was already yours, or it has none.`;
  }
  if (applied.avatar) {
    return `Picture updated from ${from}. Its name was already yours, or does not fit a display name.`;
  }
  return `Your profile already matches ${from}.`;
}

/**
 * What one connected method reports, on its row: its picture and name, what the profile would take, and the action that takes it.
 * A method that has never reported, because its last sign-in came before reports were kept, offers a sign-in with it instead: that sign-in is what makes it report.
 */
function LinkedAccountOffer({
  option,
  busy,
  disabled,
  onTake,
  onSignIn,
}: {
  option: LinkedAccountOption;
  busy: boolean;
  disabled: boolean;
  onTake: () => void;
  onSignIn: () => void;
}) {
  const from = authProviderNames[option.provider];
  const takes = [option.displayName ? `name ${option.displayName}` : null, option.image ? 'picture' : null].filter(
    (part) => part !== null
  );
  const unasked = option.syncedAt === null && takes.length === 0;
  const refused = option.name && !option.displayName ? ` “${option.name}” does not fit a display name.` : '';
  return (
    <Group justify="space-between" align="center">
      <Group gap="sm" wrap="nowrap" align="center">
        <NameDisc name={option.name ?? from} src={option.image} size={44} />
        <Stack gap="xs">
          <Text fw={650}>{option.name ?? (unasked ? 'Not asked yet' : 'No name reported')}</Text>
          <Text size="sm" c="dimmed">
            {takes.length > 0
              ? `Takes the ${takes.join(' and ')}.`
              : unasked
                ? `Sign in with ${from} once and it reports its name and picture; you come straight back here.`
                : `${from} reported nothing the profile could take.`}
            {refused}
          </Text>
        </Stack>
      </Group>
      {unasked ? (
        <LabeledAction
          accessibleName={`Sign in with ${from} to get its name and picture`}
          icon={<LogIn size={17} aria-hidden />}
          intent="neutral"
          busy={busy}
          disabledReason={disabled ? 'Another change is still running.' : undefined}
          onClick={onSignIn}
        >
          Sign in
        </LabeledAction>
      ) : (
        <LabeledAction
          accessibleName={`Take ${from} name and picture`}
          icon={<Check size={17} aria-hidden />}
          intent="positive"
          busy={busy}
          disabledReason={
            disabled
              ? takes.length === 0
                ? `${from} reported nothing the profile could take.`
                : 'Another change is still running.'
              : undefined
          }
          onClick={onTake}
        >
          Take
        </LabeledAction>
      )}
    </Group>
  );
}

function SignInMethods({
  account,
  returnTo,
  resync,
  saving,
  onTake,
}: {
  account: NonNullable<ProfileSettingsData['account']>;
  /** This tab's address, for the re-sign-in a refused change can ask for. */
  returnTo: string;
  /** Where the toolbar's Resync stands; each connected method's row shows its part of the answer. */
  resync: ResyncState;
  /** Whether the form is being saved: a pick taken meanwhile would be overwritten by the save. */
  saving: boolean;
  /** The reader takes one method's name and picture from its row. */
  onTake: (provider: AuthProvider) => void;
}) {
  const begin = useBeginAuthConnection();
  const disconnect = useDisconnectAuthMethod();
  const revokeSessions = useSignOutEverywhere();
  const { signOut } = useAuthActions();
  const signIn = useProviderSignIn();
  const [state, dispatch] = useReducer(reduceSignInMethods, { busy: null, error: null });
  const connect = async (provider: AuthProvider) => {
    dispatch({ kind: 'started', provider });
    try {
      const intent = await begin({ provider });
      holdAuthConnection(intent.token);
      await signIn(provider, { redirectTo: `/profiles/${encodeURIComponent(intent.slug)}/connect` });
    } catch (error) {
      dispatch({ kind: 'failed', error, fallback: 'The sign-in could not start.' });
    }
    dispatch({ kind: 'settled' });
  };
  /* A sign-in with a method that is already connected only makes it report its name and picture, and lands back on this tab. */
  const refresh = async (provider: AuthProvider) => {
    dispatch({ kind: 'started', provider });
    try {
      await signIn(provider, { redirectTo: returnTo });
    } catch (error) {
      dispatch({ kind: 'failed', error, fallback: 'The sign-in could not start.' });
    }
    dispatch({ kind: 'settled' });
  };
  const remove = async (provider: AuthProvider) => {
    dispatch({ kind: 'started', provider });
    try {
      await disconnect({ provider });
      await signOut();
    } catch (error) {
      dispatch({ kind: 'failed', error, fallback: 'The sign-in method could not be disconnected.' });
    }
    dispatch({ kind: 'settled' });
  };
  /* The server ends every session first, this one included; clearing this browser's tokens then only makes the page agree. */
  const signOutEverywhere = async () => {
    dispatch({ kind: 'started', provider: 'everywhere' });
    try {
      await revokeSessions({});
      await signOut();
    } catch (error) {
      dispatch({ kind: 'failed', error, fallback: 'The sign-out could not finish.' });
    }
    dispatch({ kind: 'settled' });
  };
  return (
    <Stack gap="md">
      <Text size="sm">Connect a sign-in method to use it for this profile. Keep at least one connected.</Text>
      {account.merging && (
        <StatusBadge tone="progress" live>
          Profile merge in progress. Sign-in methods are locked.
        </StatusBadge>
      )}
      <ActionError
        subject="Sign-in methods"
        verb="change"
        error={state.error}
        action={needsRecentSignIn(state.error) ? <SignInAgainAction returnTo={returnTo} /> : undefined}
      />
      <ActionError subject="Name and picture" verb="update" error={resync.error} />
      {resync.outcome.kind === 'done' && (
        <StatusBadge tone="positive" live>
          {appliedWords(resync.outcome.applied)}
        </StatusBadge>
      )}
      {account.methods.map((method) => {
        const name = authProviderNames[method.provider];
        const { outcome } = resync;
        /* Offers are shown while the choice is open; once the profile took one, the rows are rows again. */
        const option =
          outcome.kind === 'choose' || outcome.kind === 'nothing'
            ? outcome.options.find((candidate) => candidate.provider === method.provider)
            : null;
        const offer = !method.connected ? null : resync.busy === 'resync' ? (
          <Pending>{`Asking ${name}`}</Pending>
        ) : option ? (
          <LinkedAccountOffer
            option={option}
            busy={resync.busy === 'apply' || state.busy === method.provider}
            disabled={
              !!resync.busy ||
              saving ||
              !!state.busy ||
              account.merging ||
              (option.syncedAt !== null && !option.displayName && !option.image)
            }
            onTake={() => onTake(method.provider)}
            onSignIn={() => void refresh(method.provider)}
          />
        ) : null;
        const canDisconnect = account.methods.some(
          (other) => other.provider !== method.provider && other.connected && other.available
        );
        const status = method.connected
          ? canDisconnect
            ? 'Connected'
            : 'Connected · keep one sign-in method'
          : method.available
            ? 'Not connected'
            : 'Currently unavailable';
        return (
          <ControlBlock
            key={method.provider}
            title={name}
            description={
              method.connected
                ? 'Disconnecting signs you out on every device. Sign in again with a remaining method.'
                : 'Sign in with this provider to connect it.\nIf it already has a profile, review the merge first.'
            }
            input={
              <Stack gap="sm">
                <Group justify="space-between">
                  <StatusBadge tone={method.connected ? 'positive' : 'neutral'} live>
                    {status}
                  </StatusBadge>
                  {method.connected ? (
                    <HoldAction
                      label={`Disconnect ${name}`}
                      verb="remove"
                      size="lg"
                      icon={<Unlink size={17} aria-hidden />}
                      pending={state.busy === method.provider}
                      disabled={!!state.busy || account.merging || !canDisconnect}
                      onConfirm={() => void remove(method.provider)}
                    />
                  ) : (
                    <IconAction
                      label={`Connect ${name}`}
                      emphasis="standard"
                      intent="neutral"
                      size="lg"
                      icon={<Link2 size={17} aria-hidden />}
                      loading={state.busy === method.provider}
                      disabled={!!state.busy || account.merging || !method.available}
                      onClick={() => void connect(method.provider)}
                    />
                  )}
                </Group>
                {offer}
              </Stack>
            }
          />
        );
      })}
      <ControlBlock
        title="Sign out on all devices"
        description={
          'Signs this profile out everywhere, including here. Connected sign-in methods stay as they are.\nAfter a lost device or a suspected break-in, use it and also check the methods above.'
        }
        input={
          <Group justify="space-between">
            <Text size="sm">Ends every session, including this one.</Text>
            <HoldAction
              label="Sign out on all devices"
              verb="sign out"
              size="lg"
              icon={<LogOut size={17} aria-hidden />}
              pending={state.busy === 'everywhere'}
              disabled={!!state.busy || account.merging}
              onConfirm={() => void signOutEverywhere()}
            />
          </Group>
        }
      />
    </Stack>
  );
}
