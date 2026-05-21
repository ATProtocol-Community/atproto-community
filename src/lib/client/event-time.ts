export const EVENT_DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
export const EVENT_WEEK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const localDayFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const localTimeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export type EventTimingState = "past" | "live" | "today" | "week" | "later";

export interface EventTiming {
  startsAt: Date;
  endsAt: Date;
  state: EventTimingState;
}

export function localDateKey(date: Date): string {
  return localDayFmt.format(date);
}

export function readEventTiming(
  eventEl: HTMLElement,
  now: Date = new Date(),
): EventTiming | undefined {
  const startsAt = eventEl.dataset.eventStartsAt;
  if (!startsAt) return undefined;

  const start = new Date(startsAt);
  const end = eventEl.dataset.eventEndsAt
    ? new Date(eventEl.dataset.eventEndsAt)
    : new Date(start.getTime() + EVENT_DEFAULT_DURATION_MS);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return undefined;
  }

  const nowMs = now.getTime();
  const startMs = start.getTime();
  const endMs = end.getTime();
  const state: EventTimingState =
    endMs <= nowMs
      ? "past"
      : startMs <= nowMs
        ? "live"
        : localDateKey(start) === localDateKey(now)
          ? "today"
          : startMs < nowMs + EVENT_WEEK_WINDOW_MS
            ? "week"
            : "later";

  return { startsAt: start, endsAt: end, state };
}

export function formatLocalEventTime(date: Date, label?: string): string {
  const dateText =
    label ??
    date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  return `${dateText} · ${localTimeFmt.format(date)}`;
}

export function formatLocalEventClock(date: Date): string {
  return localTimeFmt.format(date);
}

export function applyEventCardTiming(
  card: HTMLElement,
  now: Date = new Date(),
): EventTiming | undefined {
  const timing = readEventTiming(card, now);
  if (!timing) return undefined;

  const timeEl = card.querySelector<HTMLTimeElement>("time[data-event-time]");
  if (timeEl) {
    const label = timing.state === "today" ? "Today" : undefined;
    timeEl.textContent = formatLocalEventTime(timing.startsAt, label);
  }

  card.classList.toggle("event-card--live", timing.state === "live");
  card.classList.toggle("event-card--today", timing.state === "today");

  return timing;
}
