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
import type * as lib_factionCatalogue from "../lib/factionCatalogue.js";
import type * as lib_factionInput from "../lib/factionInput.js";
import type * as lib_faqRulesetList from "../lib/faqRulesetList.js";
import type * as lib_homepageCommunity from "../lib/homepageCommunity.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_memberGroups from "../lib/memberGroups.js";
import type * as lib_policy from "../lib/policy.js";
import type * as lib_profileBootstrap from "../lib/profileBootstrap.js";
import type * as lib_profileSummary from "../lib/profileSummary.js";
import type * as lib_publication from "../lib/publication.js";
import type * as lib_publicationHttp from "../lib/publicationHttp.js";
import type * as lib_statistics from "../lib/statistics.js";
import type * as lib_utils from "../lib/utils.js";
import type * as localDevelopment from "../localDevelopment.js";
import type * as members from "../members.js";
import type * as migrations from "../migrations.js";
import type * as migrationsTemplate from "../migrationsTemplate.js";
import type * as profiles from "../profiles.js";
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
  "lib/factionCatalogue": typeof lib_factionCatalogue;
  "lib/factionInput": typeof lib_factionInput;
  "lib/faqRulesetList": typeof lib_faqRulesetList;
  "lib/homepageCommunity": typeof lib_homepageCommunity;
  "lib/ids": typeof lib_ids;
  "lib/memberGroups": typeof lib_memberGroups;
  "lib/policy": typeof lib_policy;
  "lib/profileBootstrap": typeof lib_profileBootstrap;
  "lib/profileSummary": typeof lib_profileSummary;
  "lib/publication": typeof lib_publication;
  "lib/publicationHttp": typeof lib_publicationHttp;
  "lib/statistics": typeof lib_statistics;
  "lib/utils": typeof lib_utils;
  localDevelopment: typeof localDevelopment;
  members: typeof members;
  migrations: typeof migrations;
  migrationsTemplate: typeof migrationsTemplate;
  profiles: typeof profiles;
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
  homepageCommunity: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"homepageCommunity">;
  statistics: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"statistics">;
};
