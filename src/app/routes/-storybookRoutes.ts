import { Route as NotFoundRoute } from './_app/$';
import { Route as IconsRoute } from './_app/[_]_icons';
import { Route as PublicationJobsRoute } from './_app/[_]_jobs';
import { Route as AdminMigrationsRoute } from './_app/admin/migrations';
import { Route as AssetEditRoute } from './_app/assets/$type/$slug/edit';
import { Route as AssetDetailRoute } from './_app/assets/$type/$slug/index';
import { Route as AssetCreateRoute } from './_app/assets/$type/create';
import { Route as AssetTypeRoute } from './_app/assets/$type/index';
import { Route as AssetsRoute } from './_app/assets/index';
import { Route as AuthErrorRoute } from './_app/auth/error';
import { Route as LoginRoute } from './_app/auth/login';
import { Route as FactionEditRoute } from './_app/factions/$factionId/edit';
import { Route as FactionDetailRoute } from './_app/factions/$factionId/index';
import { Route as FactionCreateRoute } from './_app/factions/create';
import { Route as FactionsRoute } from './_app/factions/index';
import { Route as FuturePlansRoute } from './_app/future-plans';
import { Route as GroupEditRoute } from './_app/groups/$groupSlug/edit';
import { Route as GroupDetailRoute } from './_app/groups/$groupSlug/index';
import { Route as GroupCreateRoute } from './_app/groups/create';
import { Route as HomeRoute } from './_app/index';
import { Route as PrivacyRoute } from './_app/privacy';
import { Route as ProfileDeleteRoute } from './_app/profiles/$profileSlug/delete';
import { Route as ProfileEditRoute } from './_app/profiles/$profileSlug/edit';
import { Route as ProfileDetailRoute } from './_app/profiles/$profileSlug/index';
import { Route as ProfilesRoute } from './_app/profiles/index';
import { Route as RulesetEditRoute } from './_app/rulesets/$rulesetSlug/edit';
import { Route as FaqQuestionRoute } from './_app/rulesets/$rulesetSlug/faq/$questionSlug';
import { Route as FaqCreateRoute } from './_app/rulesets/$rulesetSlug/faq/create';
import { Route as RulesetDetailRoute } from './_app/rulesets/$rulesetSlug/index';
import { Route as RulebookEditorRoute } from './_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit';
import { Route as RulesetsRoute } from './_app/rulesets/index';
import { Route as FactionSheetRoute } from './preview/sheet/$factionSlug';

const app = true;

export const storybookRoutes = {
  adminMigrations: { route: AdminMigrationsRoute, app, path: '/admin/migrations' },
  assetCreate: { route: AssetCreateRoute, app, path: '/assets/$type/create/' },
  assetDetail: { route: AssetDetailRoute, app, path: '/assets/$type/$slug/' },
  assetEdit: { route: AssetEditRoute, app, path: '/assets/$type/$slug/edit/' },
  assets: { route: AssetsRoute, app, path: '/assets/' },
  assetType: { route: AssetTypeRoute, app, path: '/assets/$type/' },
  authError: { route: AuthErrorRoute, app, path: '/auth/error' },
  factionCreate: { route: FactionCreateRoute, app, path: '/factions/create' },
  factionDetail: { route: FactionDetailRoute, app, path: '/factions/$factionId/' },
  factionEdit: { route: FactionEditRoute, app, path: '/factions/$factionId/edit' },
  factions: { route: FactionsRoute, app, path: '/factions/' },
  factionSheet: { route: FactionSheetRoute, app: false, path: '/preview/sheet/$factionSlug' },
  faqCreate: {
    route: FaqCreateRoute,
    app,
    path: '/rulesets/$rulesetSlug/faq/create',
  },
  faqQuestion: {
    route: FaqQuestionRoute,
    app,
    path: '/rulesets/$rulesetSlug/faq/$questionSlug',
  },
  futurePlans: { route: FuturePlansRoute, app, path: '/future-plans/' },
  groupCreate: { route: GroupCreateRoute, app, path: '/groups/create' },
  groupDetail: { route: GroupDetailRoute, app, path: '/groups/$groupSlug/' },
  groupEdit: { route: GroupEditRoute, app, path: '/groups/$groupSlug/edit' },
  home: { route: HomeRoute, app, path: '/' },
  icons: { route: IconsRoute, app, path: '/__icons' },
  login: { route: LoginRoute, app, path: '/auth/login' },
  notFound: { route: NotFoundRoute, app, path: '/$' },
  privacy: { route: PrivacyRoute, app, path: '/privacy/' },
  profileDelete: { route: ProfileDeleteRoute, app, path: '/profiles/$profileSlug/delete' },
  profileDetail: { route: ProfileDetailRoute, app, path: '/profiles/$profileSlug/' },
  profileEdit: { route: ProfileEditRoute, app, path: '/profiles/$profileSlug/edit' },
  profiles: { route: ProfilesRoute, app, path: '/profiles/' },
  publicationJobs: { route: PublicationJobsRoute, app, path: '/__jobs' },
  rulebookEditor: {
    route: RulebookEditorRoute,
    app,
    path: '/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit',
  },
  rulesetDetail: { route: RulesetDetailRoute, app, path: '/rulesets/$rulesetSlug/' },
  rulesetEdit: { route: RulesetEditRoute, app, path: '/rulesets/$rulesetSlug/edit' },
  rulesets: { route: RulesetsRoute, app, path: '/rulesets/' },
} as const;

export type StorybookRouteKey = keyof typeof storybookRoutes;
