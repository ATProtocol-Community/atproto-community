export type JoinStatusCode =
  | "ok"
  | "pending"
  | "already"
  | "missing"
  | "error"
  | "signin"
  | "permission"
  | "left"
  | "not-member"
  | "admin-block";

type JoinStatusCopy = {
  tone: "success" | "info" | "error";
  message: string;
};

const JOIN_STATUS_COPY: Record<JoinStatusCode, JoinStatusCopy> = {
  ok: { tone: "success", message: "You're in — welcome to the community." },
  pending: {
    tone: "info",
    message: "Request submitted — an admin will review it shortly.",
  },
  already: { tone: "info", message: "You're already a member." },
  missing: {
    tone: "error",
    message: "Couldn't find that community right now. Try again later.",
  },
  error: {
    tone: "error",
    message: "Something went wrong. Try again later.",
  },
  signin: { tone: "error", message: "Sign in first, then try again." },
  permission: {
    tone: "error",
    message:
      "Your login needs community membership permission. Log out and back in, then try again.",
  },
  left: {
    tone: "info",
    message: "You've left the community.",
  },
  "not-member": {
    tone: "info",
    message: "You weren't a member of the community.",
  },
  "admin-block": {
    tone: "error",
    message: "Admins can't leave the community. Hand off the role first.",
  },
};

export const getJoinStatusCopy = (
  status: string | null | undefined,
): JoinStatusCopy | null => {
  if (!status || !(status in JOIN_STATUS_COPY)) {
    return null;
  }

  return JOIN_STATUS_COPY[status as JoinStatusCode];
};
