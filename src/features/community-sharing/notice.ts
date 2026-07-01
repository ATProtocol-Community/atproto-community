import { pickFirstActionResult } from "../../lib/action-result";

export type ShareOutcomeCode = "ok" | "not-member";

export type UnshareOutcomeCode = "ok" | "missing";

export interface ShareNotice {
  tone: "success" | "info" | "error";
  message: string;
}

type ShareResultLike = {
  data?: {
    outcome?: ShareOutcomeCode | null;
  } | null;
  error?: {
    code?: string;
    message?: string;
  } | null;
} | null | undefined;

type UnshareResultLike = {
  data?: {
    outcome?: UnshareOutcomeCode | null;
  } | null;
  error?: {
    code?: string;
    message?: string;
  } | null;
} | null | undefined;

type ShareActionErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "INTERNAL_SERVER_ERROR";

const SHARE_OUTCOME_NOTICE: Record<ShareOutcomeCode, ShareNotice> = {
  ok: { tone: "success", message: "Shared with the community." },
  "not-member": {
    tone: "error",
    message: "Join the community before sharing content.",
  },
};

const UNSHARE_OUTCOME_NOTICE: Record<UnshareOutcomeCode, ShareNotice> = {
  ok: { tone: "success", message: "Removed from community content." },
  missing: {
    tone: "info",
    message: "That shared item was already removed.",
  },
};

const SHARE_ERROR_NOTICE: Record<ShareActionErrorCode, ShareNotice> = {
  UNAUTHORIZED: {
    tone: "error",
    message: "Sign in first, then try again.",
  },
  FORBIDDEN: {
    tone: "error",
    message:
      "Your login needs community content permission. Log out and back in, then try again.",
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
};

export function getShareNotice(
  shareResult: ShareResultLike,
  unshareResult: UnshareResultLike,
): ShareNotice | null {
  const result = pickFirstActionResult({
    items: [shareResult, unshareResult],
    hasMeaningfulData: (data) => Boolean(data?.outcome),
  });

  if (result?.data?.outcome === "ok" || result?.data?.outcome === "not-member") {
    return SHARE_OUTCOME_NOTICE[result.data.outcome];
  }

  if (result?.data?.outcome === "missing") {
    return UNSHARE_OUTCOME_NOTICE[result.data.outcome];
  }

  return getShareErrorNotice(result?.error?.code, result?.error?.message);
}

export function getShareErrorMessage(code: ShareActionErrorCode): string {
  return SHARE_ERROR_NOTICE[code].message;
}

function getShareErrorNotice(
  code?: string,
  message?: string,
): ShareNotice | null {
  if (!code) {
    return message ? { tone: "error", message } : null;
  }

  const fallback = SHARE_ERROR_NOTICE[code as ShareActionErrorCode];
  if (!fallback) {
    return message ? { tone: "error", message } : null;
  }

  return {
    tone: fallback.tone,
    message: message || fallback.message,
  };
}
