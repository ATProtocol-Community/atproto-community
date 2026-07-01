import {
  getActionErrorNotice,
  type ActionResultLike,
} from "../../lib/action-result";

export type RsvpOutcomeCode = "going" | "notgoing";

export interface RsvpNotice {
  tone: "success" | "neutral" | "error";
  message: string;
}

type RsvpResultLike = ActionResultLike<{
  outcome?: RsvpOutcomeCode | null;
  eventName?: string | null;
}>;

type RsvpActionErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "INTERNAL_SERVER_ERROR";

type RsvpOutcomeEntry = {
  tone: RsvpNotice["tone"];
  message: (eventName: string | null) => string;
};

const RSVP_OUTCOME_NOTICE: Record<RsvpOutcomeCode, RsvpOutcomeEntry> = {
  going: {
    tone: "success",
    message: (eventName) =>
      eventName ? `You're going to ${eventName}.` : "You're marked as going.",
  },
  notgoing: {
    tone: "neutral",
    message: (eventName) =>
      eventName
        ? `You're no longer going to ${eventName}.`
        : "You're no longer marked as going.",
  },
};

const RSVP_ERROR_NOTICE: Record<RsvpActionErrorCode, RsvpNotice> = {
  UNAUTHORIZED: {
    tone: "error",
    message: "You need to sign in to RSVP.",
  },
  FORBIDDEN: {
    tone: "error",
    message: "Your login is missing permission to RSVP to events.",
  },
  BAD_REQUEST: {
    tone: "error",
    message: "That RSVP request is invalid.",
  },
  NOT_FOUND: {
    tone: "error",
    message: "That event couldn't be found right now.",
  },
  INTERNAL_SERVER_ERROR: {
    tone: "error",
    message: "We couldn't update your RSVP right now. Please try again.",
  },
};

export function getRsvpNotice(
  result: RsvpResultLike,
  eventName: string | null = result?.data?.eventName ?? null,
): RsvpNotice | null {
  const outcome = result?.data?.outcome;
  if (outcome) {
    const entry = RSVP_OUTCOME_NOTICE[outcome];
    return {
      tone: entry.tone,
      message: entry.message(eventName),
    };
  }

  return getActionErrorNotice(
    RSVP_ERROR_NOTICE,
    result?.error?.code,
    result?.error?.message,
  );
}

export function getRsvpErrorMessage(code: RsvpActionErrorCode): string {
  return RSVP_ERROR_NOTICE[code].message;
}
