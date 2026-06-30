export type CommunityActionNoticeTone =
  | "success"
  | "info"
  | "neutral"
  | "error";

export interface CommunityActionNotice {
  tone: CommunityActionNoticeTone;
  message: string;
}

type CommunityActionSurface = "join" | "share" | "rsvp";
type CommunityActionErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "INTERNAL_SERVER_ERROR";

type ActionErrorLike = {
  code?: string;
  message?: string;
} | null | undefined;

const ERROR_COPY: Record<
  CommunityActionSurface,
  Record<CommunityActionErrorCode, CommunityActionNotice>
> = {
  join: {
    UNAUTHORIZED: {
      tone: "error",
      message: "Sign in first, then try again.",
    },
    FORBIDDEN: {
      tone: "error",
      message:
        "Your login needs community membership permission. Log out and back in, then try again.",
    },
    BAD_REQUEST: {
      tone: "error",
      message: "That community request is invalid.",
    },
    NOT_FOUND: {
      tone: "error",
      message: "Couldn't find that community right now. Try again later.",
    },
    INTERNAL_SERVER_ERROR: {
      tone: "error",
      message: "Something went wrong. Try again later.",
    },
  },
  share: {
    UNAUTHORIZED: {
      tone: "error",
      message: "Sign in first, then try again.",
    },
    FORBIDDEN: {
      tone: "error",
      message: "You don't have permission to update community content.",
    },
    BAD_REQUEST: {
      tone: "error",
      message: "That share request is invalid.",
    },
    NOT_FOUND: {
      tone: "error",
      message: "That item couldn't be found. Refresh the page and try again.",
    },
    INTERNAL_SERVER_ERROR: {
      tone: "error",
      message:
        "Something went wrong while updating community content. Try again later.",
    },
  },
  rsvp: {
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
  },
};

export function getCommunityActionErrorCopy(
  error: ActionErrorLike,
  surface: CommunityActionSurface,
): CommunityActionNotice | null {
  if (!error?.code) {
    return error?.message
      ? { tone: "error", message: error.message }
      : null;
  }

  const code = error.code as CommunityActionErrorCode;
  const fallback = ERROR_COPY[surface][code];
  if (!fallback) {
    return error.message ? { tone: "error", message: error.message } : null;
  }

  return {
    tone: fallback.tone,
    message: error.message || fallback.message,
  };
}
