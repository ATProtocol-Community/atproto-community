import type { CommunityEvent } from "@opensocial/community";

export function dedupeEvents<T extends Pick<CommunityEvent, "name" | "startsAt">>(
  events: T[],
): T[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.name.toLowerCase().trim()}|${event.startsAt.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
