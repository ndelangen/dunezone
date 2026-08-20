/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assetPublishingStatus from "../assetPublishingStatus.js";
import type * as auth from "../auth.js";
import type * as e2e from "../e2e.js";
import type * as factions from "../factions.js";
import type * as faq from "../faq.js";
import type * as functions from "../functions.js";
import type * as groups from "../groups.js";
import type * as homepage from "../homepage.js";
import type * as http from "../http.js";
import type * as lib_accountLifecycle from "../lib/accountLifecycle.js";
import type * as lib_applicationTriggers from "../lib/applicationTriggers.js";
import type * as lib_collaborativeAccess from "../lib/collaborativeAccess.js";
import type * as lib_collaborativeAccessValidators from "../lib/collaborativeAccessValidators.js";
import type * as lib_decalRetune from "../lib/decalRetune.js";
import type * as lib_defaultGroupPreference from "../lib/defaultGroupPreference.js";
import type * as lib_directOwnership from "../lib/directOwnership.js";
import type * as lib_factionCatalogue from "../lib/factionCatalogue.js";
import type * as lib_factionData from "../lib/factionData.js";
import type * as lib_factionInput from "../lib/factionInput.js";
import type * as lib_faqProfileActivity from "../lib/faqProfileActivity.js";
import type * as lib_faqQuestionPage from "../lib/faqQuestionPage.js";
import type * as lib_faqRulesetList from "../lib/faqRulesetList.js";
import type * as lib_faqTags from "../lib/faqTags.js";
import type * as lib_groupAssignPicker from "../lib/groupAssignPicker.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_policy from "../lib/policy.js";
import type * as lib_profileActivity from "../lib/profileActivity.js";
import type * as lib_profileBootstrap from "../lib/profileBootstrap.js";
import type * as lib_profileDetail from "../lib/profileDetail.js";
import type * as lib_profileDiscovery from "../lib/profileDiscovery.js";
import type * as lib_profileSummary from "../lib/profileSummary.js";
import type * as lib_provisioningContract from "../lib/provisioningContract.js";
import type * as lib_publication from "../lib/publication.js";
import type * as lib_publicationHttp from "../lib/publicationHttp.js";
import type * as lib_rulesetDetailPage from "../lib/rulesetDetailPage.js";
import type * as lib_statistics from "../lib/statistics.js";
import type * as lib_utils from "../lib/utils.js";
import type * as members from "../members.js";
import type * as migrations from "../migrations.js";
import type * as migrationsTemplate from "../migrationsTemplate.js";
import type * as profiles from "../profiles.js";
import type * as provisioning from "../provisioning.js";
import type * as provisioningChecks from "../provisioningChecks.js";
import type * as publicationAdmin from "../publicationAdmin.js";
import type * as publicationJobs from "../publicationJobs.js";
import type * as publicationRegeneration from "../publicationRegeneration.js";
import type * as rulesets from "../rulesets.js";
import type * as statistics from "../statistics.js";
import type * as types from "../types.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assetPublishingStatus: typeof assetPublishingStatus;
  auth: typeof auth;
  e2e: typeof e2e;
  factions: typeof factions;
  faq: typeof faq;
  functions: typeof functions;
  groups: typeof groups;
  homepage: typeof homepage;
  http: typeof http;
  "lib/accountLifecycle": typeof lib_accountLifecycle;
  "lib/applicationTriggers": typeof lib_applicationTriggers;
  "lib/collaborativeAccess": typeof lib_collaborativeAccess;
  "lib/collaborativeAccessValidators": typeof lib_collaborativeAccessValidators;
  "lib/decalRetune": typeof lib_decalRetune;
  "lib/defaultGroupPreference": typeof lib_defaultGroupPreference;
  "lib/directOwnership": typeof lib_directOwnership;
  "lib/factionCatalogue": typeof lib_factionCatalogue;
  "lib/factionData": typeof lib_factionData;
  "lib/factionInput": typeof lib_factionInput;
  "lib/faqProfileActivity": typeof lib_faqProfileActivity;
  "lib/faqQuestionPage": typeof lib_faqQuestionPage;
  "lib/faqRulesetList": typeof lib_faqRulesetList;
  "lib/faqTags": typeof lib_faqTags;
  "lib/groupAssignPicker": typeof lib_groupAssignPicker;
  "lib/ids": typeof lib_ids;
  "lib/policy": typeof lib_policy;
  "lib/profileActivity": typeof lib_profileActivity;
  "lib/profileBootstrap": typeof lib_profileBootstrap;
  "lib/profileDetail": typeof lib_profileDetail;
  "lib/profileDiscovery": typeof lib_profileDiscovery;
  "lib/profileSummary": typeof lib_profileSummary;
  "lib/provisioningContract": typeof lib_provisioningContract;
  "lib/publication": typeof lib_publication;
  "lib/publicationHttp": typeof lib_publicationHttp;
  "lib/rulesetDetailPage": typeof lib_rulesetDetailPage;
  "lib/statistics": typeof lib_statistics;
  "lib/utils": typeof lib_utils;
  members: typeof members;
  migrations: typeof migrations;
  migrationsTemplate: typeof migrationsTemplate;
  profiles: typeof profiles;
  provisioning: typeof provisioning;
  provisioningChecks: typeof provisioningChecks;
  publicationAdmin: typeof publicationAdmin;
  publicationJobs: typeof publicationJobs;
  publicationRegeneration: typeof publicationRegeneration;
  rulesets: typeof rulesets;
  statistics: typeof statistics;
  types: typeof types;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  statistics: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"statistics">;
  profileDiscovery: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"profileDiscovery">;
  profileActivity: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"profileActivity">;
};
