import { defineCollection, z } from 'astro:content';
import { standardSiteLoader } from '@bryanguffey/astro-standard-site/loader';

/**
 * Wraps the standard-site loader to strip non-serializable fields
 * that cause devalue errors in Astro's content store.
 */
function safeStandardSiteLoader(config: Parameters<typeof standardSiteLoader>[0]) {
  const inner = standardSiteLoader(config);
  return {
    name: inner.name,
    async load(ctx: Parameters<typeof inner.load>[0]) {
      const realStore = ctx.store;
      const wrappedStore = {
        ...realStore,
        set(entry: { id: string; data: unknown; digest?: string }) {
          // Deep-clone and strip non-serializable data
          const data = JSON.parse(JSON.stringify(entry.data, (_key, value) => {
            // Strip Uint8Array, Buffer, and other non-POJO types
            if (value instanceof Uint8Array || Buffer.isBuffer(value)) return undefined;
            return value;
          }));
          realStore.set({ ...entry, data });
        },
        clear: realStore.clear.bind(realStore),
      };
      return inner.load({ ...ctx, store: wrappedStore });
    },
  };
}

const blog = defineCollection({
  loader: safeStandardSiteLoader({
    repo: 'atmosphere.community',
    service: 'https://hydnum.us-west.host.bsky.network',
    limit: 100,
  }),
  schema: z.object({
    id: z.string(),
    uri: z.string(),
    cid: z.string(),
    title: z.string().optional(),
    site: z.string().optional(),
    publishedAt: z.coerce.date().optional(),
    updatedAt: z.coerce.date().optional(),
    path: z.string().optional(),
    url: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    textContent: z.string().optional(),
    content: z.unknown().optional(),
  }),
});

export const collections = { blog };
