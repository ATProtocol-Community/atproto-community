export type ShareStatusCode =
  | "ok"
  | "signin"
  | "not-member"
  | "no-permission"
  | "not-found"
  | "failed";

export type UnshareStatusCode =
  | "ok"
  | "missing"
  | "signin"
  | "not-author"
  | "no-permission"
  | "not-found"
  | "failed";

type ShareStatusCopy = {
  tone: "success" | "info" | "error";
  message: string;
};

const SHARE_STATUS_COPY: Record<ShareStatusCode, ShareStatusCopy> = {
  ok: { tone: "success", message: "Shared with the community." },
  signin: { tone: "error", message: "Sign in first, then try sharing again." },
  "not-member": {
    tone: "error",
    message: "Join the community before sharing content.",
  },
  "no-permission": {
    tone: "error",
    message:
      "Your login needs community content permission. Log out and back in, then try again.",
  },
  "not-found": {
    tone: "error",
    message: "That item couldn't be shared. Pick another one and try again.",
  },
  failed: {
    tone: "error",
    message: "Something went wrong while updating community content. Try again later.",
  },
};

const UNSHARE_STATUS_COPY: Record<UnshareStatusCode, ShareStatusCopy> = {
  ok: { tone: "success", message: "Removed from community content." },
  missing: { tone: "info", message: "That shared item was already removed." },
  signin: { tone: "error", message: "Sign in first, then try unsharing again." },
  "not-author": {
    tone: "error",
    message: "Only the original sharer can remove that item.",
  },
  "no-permission": {
    tone: "error",
    message:
      "Your login needs community content permission. Log out and back in, then try again.",
  },
  "not-found": {
    tone: "error",
    message: "That item couldn't be removed. Refresh the page and try again.",
  },
  failed: {
    tone: "error",
    message: "Something went wrong while updating community content. Try again later.",
  },
};

export function getShareStatusCopy(
  shareStatus: string | null | undefined,
  unshareStatus: string | null | undefined,
  hasUnexpectedError = false,
): ShareStatusCopy | null {
  if (shareStatus && shareStatus in SHARE_STATUS_COPY) {
    return SHARE_STATUS_COPY[shareStatus as ShareStatusCode];
  }

  if (unshareStatus && unshareStatus in UNSHARE_STATUS_COPY) {
    return UNSHARE_STATUS_COPY[unshareStatus as UnshareStatusCode];
  }

  if (hasUnexpectedError) {
    return SHARE_STATUS_COPY.failed;
  }

  return null;
}
