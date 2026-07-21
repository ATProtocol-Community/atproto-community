import { defineLiveCollection } from "astro:content";
import { z } from "astro/zod";
import { defineAtProtoLiveCollection } from "@fujocoded/astro-atproto-loader";
import { getProfile, prefetchSourceProfiles } from "./lib/community/index.js";
import { hasOpenSocialProfile } from "./lib/community/opensocial-profile.js";
import yaml from "js-yaml";
import communitiesRaw from "./data/communities.yml?raw";
import {
  eventFilters,
  eventGroupKey,
  eventsOutputSchema,
  feedFilters,
  feedOutputSchema,
  feedTransformers,
  parseSharedEventRecord,
  transformEventGroup,
  type LoaderArgs,
} from "./lib/live-handlers";
import {
  createDiscourseActivityLoader,
  discourseActivityTopicSchema,
} from "./lib/discourse-activity";
import {
  createAvatarFallback,
  hueFromString,
} from "./lib/avatar-fallback";

interface CommunityDefinition {
  name: string;
  handle: string;
  location: string;
  region?: string;
  description?: string;
  bluesky?: string;
  website?: string;
}

type AvatarSource =
  | { url: string }
  | { initials: string; color: string };

interface CommunityCardData
  extends CommunityDefinition, Record<string, unknown> {
  avatar: AvatarSource;
  // Derived at load time: true when the account's repo carries a
  // community.opensocial.profile record (i.e. runs the opensocial.community software).
  isOpenSocialCommunity: boolean;
}

function communityAvatar(handle: string, url?: string): AvatarSource {
  if (url) return { url };
  return { initials: avatarInitials(handle), color: avatarColor(handle) };
}

// Strip well-known atproto/bluesky suffixes so the abbreviation reflects the
// distinctive part of a handle (e.g. "@nyc.atproto.camp" → "NYC").
const HANDLE_SUFFIXES =
  /\.(bsky\.social|atproto\.camp|atprotocol\.community|atprotocol\.space)$/;
function avatarInitials(handle: string): string {
  return handle
    .replace(HANDLE_SUFFIXES, "")
    .replace(/^atproto\.?/, "")
    .slice(0, 3)
    .toUpperCase();
}
function avatarColor(handle: string): string {
  return `oklch(50% 0.13 ${hueFromString(handle)})`;
}

function enrichAuthor(author: {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}) {
  const label = author.displayName || `@${author.handle}`;
  return {
    did: author.did,
    handle: author.handle,
    displayName: author.displayName,
    avatar: author.avatar
      ? { url: author.avatar }
      : createAvatarFallback({ label }),
  };
}

function enrichOptionalAuthor(
  author:
    | {
        did: string;
        handle: string;
        displayName?: string;
        avatar?: string;
      }
    | undefined,
) {
  return author ? enrichAuthor(author) : undefined;
}

const communityDefinitions = yaml.load(communitiesRaw) as CommunityDefinition[];
// atmosphere.community is the site's own account — kept separate from the YAML-defined
// communities because it publishes a different lexicon (site.standard.document, see feed below)
// and isn't itself a "community" in the listing sense.
const communityAccounts = [
  "atmosphere.community",
  ...communityDefinitions.map((community) => community.handle),
];
const ACTIVITY_CACHE_TTL_MS = 1000 * 60 * 5;
const LIMIT_RECORDS_PER_SOURCE = 200;
const MAX_PAGES_PER_SOURCE = 2;

const forum = defineLiveCollection({
  loader: createDiscourseActivityLoader({
    baseUrl: "https://discourse.atprotocol.community",
    source: { type: "latest" },
    limit: 10,
    cacheTtlMs: ACTIVITY_CACHE_TTL_MS,
  }),
  schema: discourseActivityTopicSchema,
});

// Warm the source-profile cache once at server boot. Per-record transformers
// in lib/live-handlers (e.g. site.standard.document → getProfile('atmosphere.community'),
// shared-content → getProfile(author handle)) become cache hits for our curated set.
// External authors referenced from shared-content fall through to the regular
// profile cache. The source cache is never evicted; the general one may be later.
await prefetchSourceProfiles(communityAccounts);

const feed = defineAtProtoLiveCollection({
  outputSchema: feedOutputSchema,
  cacheTtl: ACTIVITY_CACHE_TTL_MS,
  sources: [
    // The site's own curated posts use site.standard.document; community accounts share
    // links via community.opensocial.sharedContent. Both feed into the same output schema
    // with per-collection filter/transform dispatch below.
    {
      repo: "atmosphere.community",
      collection: "site.standard.document" as const,
      limit: LIMIT_RECORDS_PER_SOURCE,
      maxPages: MAX_PAGES_PER_SOURCE,
    },
    ...communityAccounts.map((repo) => ({
      repo,
      collection: "community.opensocial.sharedContent" as const,
      limit: LIMIT_RECORDS_PER_SOURCE,
      maxPages: MAX_PAGES_PER_SOURCE,
    })),
  ],
  // A single broken/unreachable repo shouldn't blank out the whole feed during build.
  onSourceError: "skip",
  filter: (ctx) => feedFilters[ctx.collection](ctx as LoaderArgs),
  // Enrich the author with avatar-fallback fields (initials + color) here in the
  // live config so components consume ready-to-render data instead of recomputing.
  transform: async (ctx) => {
    const result = await feedTransformers[ctx.collection](ctx as LoaderArgs);
    if (!result) return null;
    return {
      ...result,
      data: {
        ...result.data,
        author: enrichAuthor(result.data.author),
        sharedBy: enrichOptionalAuthor(result.data.sharedBy),
      },
    };
  },
});

const events = defineAtProtoLiveCollection({
  outputSchema: eventsOutputSchema,
  cacheTtl: ACTIVITY_CACHE_TTL_MS,
  sources: [
    // Two paths into the events list:
    //   1. Native calendar records authored by the community itself.
    //   2. Shared-content records pointing at someone else's event — re-resolved by the
    //      grouped transformer so the listing surfaces events a community is *boosting*.
    // Natives are listed first so that, for any group that contains both a native and
    // its reshares, the native arrives at index 0 of `records` and wins as canonical.
    ...communityAccounts.map((repo) => ({
      repo,
      collection: "community.lexicon.calendar.event" as const,
      limit: LIMIT_RECORDS_PER_SOURCE,
      maxPages: MAX_PAGES_PER_SOURCE,
    })),
    ...communityAccounts.map((repo) => ({
      repo,
      collection: "community.opensocial.sharedContent" as const,
      limit: LIMIT_RECORDS_PER_SOURCE,
      maxPages: MAX_PAGES_PER_SOURCE,
      parseRecord: (value: unknown) => parseSharedEventRecord(value, repo),
    })),
  ],
  onSourceError: "skip",
  filter: (ctx) => eventFilters[ctx.collection](ctx as LoaderArgs),
  // groupBy collapses native + reshares of the same canonical at-URI into one entry;
  // the grouped transform picks the canonical record and annotates `original`/`sharedBy`.
  groupBy: (ctx) => eventGroupKey(ctx as LoaderArgs),
  transform: (args) =>
    transformEventGroup({
      key: args.key,
      records: args.records as LoaderArgs[],
      fetchRecord: args.fetchRecord,
    }),
});

// The community list itself is YAML-driven (curated, not network-discovered). The loader's
// only job is to enrich each static entry with the live ATProto profile avatar.
const communities = defineLiveCollection({
  loader: {
    name: "communities-live",
    async loadCollection() {
      // allSettled, not all: a single unreachable PDS shouldn't blank out the whole listing.
      // Failed profile lookups simply fall back to no avatar; a failed opensocial
      // probe (hasOpenSocialProfile swallows its own errors) falls back to false.
      const [profileResults, openSocialResults] = await Promise.all([
        Promise.allSettled(
          communityDefinitions.map((community) => getProfile(community.handle)),
        ),
        Promise.allSettled(
          communityDefinitions.map((community) =>
            hasOpenSocialProfile(community.handle),
          ),
        ),
      ]);

      return {
        entries: communityDefinitions.map((community, index) => {
          const result = profileResults[index];
          const profileAvatar =
            result?.status === "fulfilled" ? result.value.avatar : undefined;
          const openSocial = openSocialResults[index];
          return {
            id: community.handle,
            data: {
              ...community,
              avatar: communityAvatar(community.handle, profileAvatar),
              isOpenSocialCommunity:
                openSocial?.status === "fulfilled" ? openSocial.value : false,
            } satisfies CommunityCardData,
          };
        }),
      };
    },
    // Single-entry path used by per-community detail pages — avoids fetching every profile
    // when only one is needed.
    async loadEntry({ filter }: { filter: { id: string } }) {
      const community = communityDefinitions.find(
        (entry) => entry.handle === filter.id,
      );
      if (!community) return undefined;

      const [profile, isOpenSocialCommunity] = await Promise.all([
        getProfile(community.handle).catch(() => undefined),
        hasOpenSocialProfile(community.handle),
      ]);
      return {
        id: community.handle,
        data: {
          ...community,
          avatar: communityAvatar(community.handle, profile?.avatar),
          isOpenSocialCommunity,
        } satisfies CommunityCardData,
      };
    },
  },
  schema: z.object({
    name: z.string(),
    handle: z.string(),
    location: z.string(),
    region: z.string().optional(),
    description: z.string().optional(),
    bluesky: z.string().optional(),
    website: z.string().optional(),
    isOpenSocialCommunity: z.boolean(),
    avatar: z.union([
      z.object({ url: z.string() }),
      z.object({ initials: z.string(), color: z.string() }),
    ]),
  }),
});

export const collections = { feed, events, communities, forum };
