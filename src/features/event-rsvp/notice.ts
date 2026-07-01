export type RsvpOutcomeCode = "going" | "notgoing";

export interface RsvpNotice {
  tone: "success" | "neutral" | "error";
  message: string;
}

type RsvpResultLike = {
  data?: {
    outcome?: RsvpOutcomeCode | null;
    eventName?: string | null;
  } | null;
  error?: {
    code?: string;
    message?: string;
  } | null;
} | null | undefined;

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

  return getRsvpErrorNotice(result?.error?.code, result?.error?.message);
}

export function getRsvpErrorMessage(code: RsvpActionErrorCode): string {
  return RSVP_ERROR_NOTICE[code].message;
}

function getRsvpErrorNotice(
  code?: string,
  message?: string,
): RsvpNotice | null {
  if (!code) {
    return message ? { tone: "error", message } : null;
  }

  const fallback = RSVP_ERROR_NOTICE[code as RsvpActionErrorCode];
  if (!fallback) {
    return message ? { tone: "error", message } : null;
  }

  return {
    tone: fallback.tone,
    message: message || fallback.message,
  };
}
