export type JoinOutcomeCode =
  | "ok"
  | "pending"
  | "already"
  | "left"
  | "not-member"
  | "admin-block";

type JoinOutcomeCopy = {
  tone: "success" | "info" | "error";
  message: string;
};

const JOIN_OUTCOME_COPY: Record<JoinOutcomeCode, JoinOutcomeCopy> = {
  ok: { tone: "success", message: "You're in — welcome to the community." },
  pending: {
    tone: "info",
    message: "Request submitted — an admin will review it shortly.",
  },
  already: { tone: "info", message: "You're already a member." },
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

export const getJoinOutcomeCopy = (
  outcome: JoinOutcomeCode | null | undefined,
): JoinOutcomeCopy | null => {
  if (!outcome) {
    return null;
  }

  return JOIN_OUTCOME_COPY[outcome];
};
