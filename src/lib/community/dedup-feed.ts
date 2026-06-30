type FeedAuthor = {
  did: string;
  handle: string;
  displayName?: string;
  avatar: unknown;
};

export interface FeedEntryLike {
  title: string;
  url: string;
  excerpt?: string;
  publishedAt?: Date;
  sharedAt: Date;
  author: FeedAuthor;
  sharedBy?: FeedAuthor;
  source: string;
  documentUri: string;
  shareRecordUri?: string;
  shareRecordRkey?: string;
  tags?: string[];
}

const PRIMARY_SOURCE = 'atmosphere.community';

export function dedupeFeedEntries<T extends FeedEntryLike>(entries: T[]): T[] {
  const deduped = new Map<string, T>();

  for (const entry of entries) {
    const existing = deduped.get(entry.documentUri);
    if (!existing || isPreferredFeedEntry(entry, existing)) {
      deduped.set(entry.documentUri, entry);
    }
  }

  return [...deduped.values()];
}

function isPreferredFeedEntry<T extends FeedEntryLike>(candidate: T, current: T): boolean {
  const candidateIsPrimary = candidate.source === PRIMARY_SOURCE;
  const currentIsPrimary = current.source === PRIMARY_SOURCE;
  if (candidateIsPrimary !== currentIsPrimary) {
    return !candidateIsPrimary;
  }

  const candidateTime = (candidate.publishedAt ?? candidate.sharedAt).getTime();
  const currentTime = (current.publishedAt ?? current.sharedAt).getTime();
  if (candidateTime !== currentTime) {
    return candidateTime > currentTime;
  }

  return candidate.source.localeCompare(current.source) < 0;
}
