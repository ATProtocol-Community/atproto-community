export type JoinOutcomeCode =
  | "ok"
  | "pending"
  | "already"
  | "left"
  | "not-member"
  | "admin-block";

export interface JoinNotice {
  tone: "success" | "info" | "error";
  message: string;
}

type JoinResultLike = {
  data?: {
    outcome?: JoinOutcomeCode | null;
  } | null;
  error?: {
    code?: string;
    message?: string;
  } | null;
} | null | undefined;

type JoinActionErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "INTERNAL_SERVER_ERROR";

const JOIN_OUTCOME_NOTICE: Record<JoinOutcomeCode, JoinNotice> = {
  ok: { tone: "success", message: "You're in — welcome to the community." },
  pending: {
    tone: "info",
    message: "Request submitted — an admin will review it shortly.",
  },
  already: { tone: "info", message: "You're already a member." },
  left: { tone: "info", message: "You've left the community." },
  "not-member": {
    tone: "info",
    message: "You weren't a member of the community.",
  },
  "admin-block": {
    tone: "error",
    message: "Admins can't leave the community. Hand off the role first.",
  },
};

const JOIN_ERROR_NOTICE: Record<JoinActionErrorCode, JoinNotice> = {
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
};

export function getJoinNotice(result: JoinResultLike): JoinNotice | null {
  const outcome = result?.data?.outcome;
  if (outcome) {
    return JOIN_OUTCOME_NOTICE[outcome];
  }

  return getJoinErrorNotice(result?.error?.code, result?.error?.message);
}

export function getJoinErrorMessage(code: JoinActionErrorCode): string {
  return JOIN_ERROR_NOTICE[code].message;
}

function getJoinErrorNotice(
  code?: string,
  message?: string,
): JoinNotice | null {
  if (!code) {
    return message ? { tone: "error", message } : null;
  }

  const fallback = JOIN_ERROR_NOTICE[code as JoinActionErrorCode];
  if (!fallback) {
    return message ? { tone: "error", message } : null;
  }

  return {
    tone: fallback.tone,
    message: message || fallback.message,
  };
}
