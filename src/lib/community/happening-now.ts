const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const THIS_WEEK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function eventAnchorId(atUri: string): string {
  return `event-${atUri.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

export const HAPPENING_NOW_LIMIT = 3;
export const HAPPENING_TODAY_LIMIT = 3;
export const HAPPENING_THIS_WEEK_LIMIT = 6;

export interface HappeningNowCandidate {
  atUri: string;
  startsAt: Date;
  endsAt?: Date;
}

export interface HappeningNowAnnotation<T extends HappeningNowCandidate> {
  event: T;
  isLive: boolean;
  startsAt: Date;
  endsAt: Date;
}

export interface HappeningNowGroups<T extends HappeningNowCandidate> {
  now: HappeningNowAnnotation<T>[];
  today: HappeningNowAnnotation<T>[];
  thisWeek: HappeningNowAnnotation<T>[];
}

export function selectHappeningNow<T extends HappeningNowCandidate>(
  events: T[],
  now: Date = new Date(),
): HappeningNowAnnotation<T>[] {
  return annotateEvents(events)
    .map((it) => withLiveState(it, now))
    .filter((it) => it.isLive)
    .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime())
    .slice(0, HAPPENING_NOW_LIMIT);
}

export function selectHappeningNowGroups<T extends HappeningNowCandidate>(
  events: T[],
  now: Date = new Date(),
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): HappeningNowGroups<T> {
  const annotated = annotateEvents(events)
    .map((it) => withLiveState(it, now))
    .filter((it) => it.endsAt.getTime() > now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const nowItems = annotated
    .filter((it) => it.isLive)
    .slice(0, HAPPENING_NOW_LIMIT);
  const liveUris = new Set(nowItems.map((it) => it.event.atUri));

  const todayKey = getDateKey(now, timeZone);
  const thisWeekEndsAt = now.getTime() + THIS_WEEK_WINDOW_MS;

  const today = annotated
    .filter(
      (it) =>
        !liveUris.has(it.event.atUri) &&
        it.startsAt.getTime() > now.getTime() &&
        getDateKey(it.startsAt, timeZone) === todayKey,
    )
    .slice(0, HAPPENING_TODAY_LIMIT);
  const todayUris = new Set(today.map((it) => it.event.atUri));

  const thisWeek = annotated
    .filter(
      (it) =>
        !liveUris.has(it.event.atUri) &&
        !todayUris.has(it.event.atUri) &&
        it.startsAt.getTime() > now.getTime() &&
        it.startsAt.getTime() < thisWeekEndsAt,
    )
    .slice(0, HAPPENING_THIS_WEEK_LIMIT);

  return { now: nowItems, today, thisWeek };
}

function annotateEvents<T extends HappeningNowCandidate>(
  events: T[],
): HappeningNowAnnotation<T>[] {
  return events
    .map((event) => {
      const startsAt = event.startsAt;
      const endsAt = event.endsAt
        ? event.endsAt
        : new Date(startsAt.getTime() + DEFAULT_DURATION_MS);
      return { event, isLive: false, startsAt, endsAt };
    })
    .filter((it) => it.endsAt.getTime() > it.startsAt.getTime());
}

function isLiveAt<T extends HappeningNowCandidate>(
  item: HappeningNowAnnotation<T>,
  now: Date,
): boolean {
  const nowMs = now.getTime();
  return (
    item.startsAt.getTime() <= nowMs &&
    nowMs < item.endsAt.getTime()
  );
}

function withLiveState<T extends HappeningNowCandidate>(
  item: HappeningNowAnnotation<T>,
  now: Date,
): HappeningNowAnnotation<T> {
  return { ...item, isLive: isLiveAt(item, now) };
}

function getDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Display helpers — no Temporal import here so they stay cheap in the
// client bundle that re-renders countdowns on a tick.

const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

type DisplayUnit = "minute" | "hour" | "day";

function pickUnit(ms: number): { value: number; unit: DisplayUnit } {
  const abs = Math.abs(ms);
  if (abs < 3_600_000)
    return { value: Math.round(ms / 60_000), unit: "minute" };
  if (abs < 86_400_000)
    return { value: Math.round(ms / 3_600_000), unit: "hour" };
  return { value: Math.round(ms / 86_400_000), unit: "day" };
}

export function formatStartsIn(diffMs: number): string {
  if (diffMs <= 0) return "starting now";
  const { value, unit } = pickUnit(diffMs);
  return RTF.format(value, unit);
}

export function formatTimeLeft(diffMs: number): string {
  if (diffMs <= 0) return "ended";
  const { value, unit } = pickUnit(diffMs);
  return `${new Intl.NumberFormat("en", {
    style: "unit",
    unit,
    unitDisplay: "long",
  }).format(value)} left`;
}
