import { defineLiveCollection } from "astro:content";
import { z } from "astro/zod";
import {
  atProtoLiveLoader,
  type AtProtoLoaderSource,
} from "@fujocoded/astro-atproto-loader";
import { getProfile } from "@opensocial/community";
// @ts-expect-error js-yaml has no bundled types; YAML community data is validated by schema below
import yaml from "js-yaml";
import communitiesRaw from "./data/communities.yml?raw";
import {
  eventDedupers,
  eventFilters,
  eventTransformers,
  feedDedupers,
  feedFilters,
  feedTransformers,
} from "./lib/live-handlers";

interface CommunityDefinition {
  name: string;
  handle: string;
  location: string;
  description?: string;
  bluesky?: string;
  website?: string;
}

interface CommunityCardData
  extends CommunityDefinition, Record<string, unknown> {
  avatarUrl?: string;
}

const communityDefinitions = yaml.load(communitiesRaw) as CommunityDefinition[];
const communityAccounts = [
  "atmosphere.community",
  ...communityDefinitions.map((community) => community.handle),
];

const authorSchema = z.object({
  did: z.string(),
  handle: z.string(),
  displayName: z.string().optional(),
  avatar: z.string().optional(),
});

const feed = defineLiveCollection({
  loader: atProtoLiveLoader({
    sources: [
      {
        repo: "atmosphere.community",
        collection: "site.standard.document" as const,
        limit: "all",
      },
      ...communityAccounts.map((repo) => ({
        repo,
        collection: "community.opensocial.sharedContent" as const,
        limit: "all" as const,
      })),
    ],
    onSourceError: "skip",
    filter: (ctx) => feedFilters[ctx.collection](ctx),
    dedupeBy: (ctx) => feedDedupers[ctx.collection](ctx),
    transform: (ctx) => feedTransformers[ctx.collection](ctx),
  }),
  schema: z.object({
    title: z.string(),
    url: z.string(),
    excerpt: z.string().optional(),
    publishedAt: z.coerce.date().optional(),
    sharedAt: z.coerce.date(),
    author: authorSchema,
    source: z.string(),
    documentUri: z.string(),
    tags: z.array(z.string()).optional(),
  }),
});

const events = defineLiveCollection({
  loader: atProtoLiveLoader({
    sources: [
      ...communityAccounts.map((repo) => ({
        repo,
        collection: "community.lexicon.calendar.event" as const,
        limit: "all" as const,
      })),
      ...communityAccounts.map((repo) => ({
        repo,
        collection: "community.opensocial.sharedContent" as const,
        limit: "all" as const,
      })),
    ],
    onSourceError: "skip",
    filter: (ctx) => eventFilters[ctx.collection](ctx),
    dedupeBy: (ctx) => eventDedupers[ctx.collection](ctx),
    transform: (ctx) => eventTransformers[ctx.collection](ctx),
  }),
  schema: z.object({
    name: z.string(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional(),
    description: z.string().optional(),
    mode: z.enum(["inperson", "virtual", "hybrid"]),
    location: z.string().optional(),
    uri: z.string(),
    source: z.string(),
  }),
});

const communities = defineLiveCollection({
  loader: {
    name: "communities-live",
    async loadCollection() {
      const profileResults = await Promise.allSettled(
        communityDefinitions.map((community) => getProfile(community.handle)),
      );

      return {
        entries: communityDefinitions.map((community, index) => ({
          id: community.handle,
          data: {
            ...community,
            avatarUrl:
              profileResults[index]?.status === "fulfilled"
                ? profileResults[index].value.avatar
                : undefined,
          } satisfies CommunityCardData,
        })),
      };
    },
    async loadEntry({ filter }: { filter: { id: string } }) {
      const community = communityDefinitions.find(
        (entry) => entry.handle === filter.id,
      );
      if (!community) return undefined;

      const profile = await getProfile(community.handle).catch(() => undefined);
      return {
        id: community.handle,
        data: {
          ...community,
          avatarUrl: profile?.avatar,
        } satisfies CommunityCardData,
      };
    },
  },
  schema: z.object({
    name: z.string(),
    handle: z.string(),
    location: z.string(),
    description: z.string().optional(),
    bluesky: z.string().optional(),
    website: z.string().optional(),
    avatarUrl: z.string().optional(),
  }),
});

export const collections = { feed, events, communities };
