export type ShareOutcomeCode =
  | "ok"
  | "not-member";

export type UnshareOutcomeCode =
  | "ok"
  | "missing";

type ShareOutcomeCopy = {
  tone: "success" | "info" | "error";
  message: string;
};

const SHARE_OUTCOME_COPY: Record<ShareOutcomeCode, ShareOutcomeCopy> = {
  ok: { tone: "success", message: "Shared with the community." },
  "not-member": {
    tone: "error",
    message: "Join the community before sharing content.",
  },
};

const UNSHARE_OUTCOME_COPY: Record<UnshareOutcomeCode, ShareOutcomeCopy> = {
  ok: { tone: "success", message: "Removed from community content." },
  missing: { tone: "info", message: "That shared item was already removed." },
};

export function getShareOutcomeCopy(
  shareOutcome: ShareOutcomeCode | null | undefined,
  unshareOutcome: UnshareOutcomeCode | null | undefined,
): ShareOutcomeCopy | null {
  if (shareOutcome) {
    return SHARE_OUTCOME_COPY[shareOutcome];
  }

  if (unshareOutcome) {
    return UNSHARE_OUTCOME_COPY[unshareOutcome];
  }

  return null;
}
