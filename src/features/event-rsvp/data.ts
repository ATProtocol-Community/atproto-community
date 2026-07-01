import { TID } from "@atproto/common-web";
import { AtUri } from "@atproto/api";
import { getLoggedInAgent } from "@fujocoded/authproto/helpers";

export const RSVP_COLLECTION = "community.lexicon.calendar.rsvp";
export const RSVP_STATUS_GOING = "community.lexicon.calendar.rsvp#going";
export const RSVP_STATUS_INTERESTED = "community.lexicon.calendar.rsvp#interested";
export const RSVP_STATUS_NOT_GOING = "community.lexicon.calendar.rsvp#notgoing";

export type RsvpStatus =
  | typeof RSVP_STATUS_GOING
  | typeof RSVP_STATUS_INTERESTED
  | typeof RSVP_STATUS_NOT_GOING;

export interface CalendarRsvpRecord {
  $type: "community.lexicon.calendar.rsvp";
  subject: { uri: string; cid: string };
  status: RsvpStatus;
  createdAt: string;
}

export interface CalendarRsvp {
  uri: string;
  cid: string;
  rkey: string;
  record: CalendarRsvpRecord;
}

export type LoggedInUser = NonNullable<App.Locals["loggedInUser"]>;

interface EventLike {
  uri: string;
}

function preferLatest(
  current: CalendarRsvp | undefined,
  candidate: CalendarRsvp,
): CalendarRsvp {
  if (!current) {
    return candidate;
  }

  const currentDate = Date.parse(current.record.createdAt ?? "");
  const candidateDate = Date.parse(candidate.record.createdAt ?? "");
  if (!Number.isNaN(candidateDate) && (Number.isNaN(currentDate) || candidateDate > currentDate)) {
    return candidate;
  }
  if (!Number.isNaN(currentDate) && (Number.isNaN(candidateDate) || candidateDate <= currentDate)) {
    return current;
  }

  return candidate.uri > current.uri ? candidate : current;
}

async function listAllRsvps(
  loggedInUser: LoggedInUser,
): Promise<CalendarRsvp[]> {
  const agent = await getLoggedInAgent(loggedInUser);
  if (!agent) {
    return [];
  }

  const results: CalendarRsvp[] = [];
  let cursor: string | undefined;

  do {
    const response = await agent.com.atproto.repo.listRecords({
      repo: loggedInUser.did,
      collection: RSVP_COLLECTION,
      limit: 100,
      cursor,
    });

    for (const record of response.data.records) {
      const value = record.value as Partial<CalendarRsvpRecord>;
      if (!value || !value.subject?.uri || !value.status) {
        continue;
      }

      results.push({
        uri: record.uri,
        cid: record.cid,
        rkey: new AtUri(record.uri).rkey,
        record: value as CalendarRsvpRecord,
      });
    }

    cursor = response.data.cursor;
  } while (cursor);

  return results;
}

export async function getRsvpsForEvents(
  loggedInUser: LoggedInUser,
  events: EventLike[],
): Promise<Map<string, CalendarRsvp>> {
  const subjectUris = new Set(events.map((event) => event.uri));
  const all = await listAllRsvps(loggedInUser);

  const bySubject = new Map<string, CalendarRsvp>();
  for (const entry of all) {
    const subjectUri = entry.record.subject.uri;
    if (!subjectUris.has(subjectUri)) {
      continue;
    }

    bySubject.set(subjectUri, preferLatest(bySubject.get(subjectUri), entry));
  }

  return bySubject;
}

export async function setRsvpStatus(
  loggedInUser: LoggedInUser,
  subject: { uri: string; cid: string },
  status: RsvpStatus,
): Promise<void> {
  const agent = await getLoggedInAgent(loggedInUser);
  if (!agent) {
    throw new Error("Not logged in");
  }

  const all = await listAllRsvps(loggedInUser);
  const existing = all.find(
    (entry) => entry.record.subject.uri === subject.uri,
  );

  const record: CalendarRsvpRecord = {
    $type: "community.lexicon.calendar.rsvp",
    subject,
    status,
    createdAt: new Date().toISOString(),
  };

  await agent.com.atproto.repo.putRecord({
    repo: loggedInUser.did,
    collection: RSVP_COLLECTION,
    rkey: existing?.rkey ?? TID.nextStr(),
    record: record as unknown as Record<string, unknown>,
    validate: false,
  });
}
