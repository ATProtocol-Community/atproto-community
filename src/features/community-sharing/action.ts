import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { AtUri } from "@atproto/api";

import { getAtmosphereCommunityDid } from "../../lib/community/atmosphere";
import { getShareCandidateByUri } from "../../lib/community/share-candidates";
import { getRepoRecordByUri } from "../../lib/community/repo";
import {
  parseSharedDocumentRef,
  type SharedDocumentRef,
} from "../../lib/community/shared-content";
import {
  SHARED_CONTENT_COLLECTION,
  shareContentWithCommunity,
  unshareContentWithCommunity,
} from "../../lib/opensocial/content-sharing";
import { OpenSocialCommunityError } from "../../lib/opensocial/client";
import { getMembership } from "../../lib/opensocial/membership";
import { isPermissionError } from "../../lib/action-result";
import {
  getShareErrorMessage,
  type ShareOutcomeCode,
  type UnshareOutcomeCode,
} from "./notice";

type LoggedInUser = NonNullable<App.Locals["loggedInUser"]>;

function parseSharedContentRecordUri({
  uri,
  communityDid,
}: {
  uri: string;
  communityDid: string;
}): AtUri | null {
  try {
    const parsed = new AtUri(uri);
    return parsed.host === communityDid &&
      parsed.collection === SHARED_CONTENT_COLLECTION &&
      parsed.rkey.length > 0
      ? parsed
      : null;
  } catch {
    return null;
  }
}

async function loadSharedDocumentRef({
  shareRecordUri,
  communityDid,
  shareRecordRkey,
}: {
  shareRecordUri: string;
  communityDid: string;
  shareRecordRkey: string;
}): Promise<SharedDocumentRef> {
  const response = await getRepoRecordByUri(shareRecordUri);
  if (!response || typeof response.value !== "object" || response.value === null) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "That item couldn't be removed. Refresh the page and try again.",
    });
  }

  const sharedRecord = parseSharedDocumentRef(
    response.value as Record<string, unknown>,
    {
      source: communityDid,
      shareRecordUri: response.uri,
      shareRecordRkey,
    },
  );
  if (!sharedRecord) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "That item couldn't be removed. Refresh the page and try again.",
    });
  }

  return sharedRecord;
}

async function assertCanUnshare({
  sharedRecord,
  loggedInUser,
  communityDid,
}: {
  sharedRecord: SharedDocumentRef;
  loggedInUser: LoggedInUser;
  communityDid: string;
}): Promise<void> {
  if (sharedRecord.sharedBy === loggedInUser.did) {
    return;
  }

  const membership = await getMembership({
    communityDid,
    userDid: loggedInUser.did,
  });
  if (!membership.isAdmin) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: "Only the original sharer can remove that item.",
    });
  }
}

export const sharingActions = {
  shareAtmosphereContent: defineAction({
    accept: "form",
    input: z.object({
      candidateUri: z.string().min(1),
      sourceRepo: z.string().min(1).optional(),
    }),
    handler: async (input, ctx): Promise<{ outcome: ShareOutcomeCode }> => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "Sign in first, then try sharing again.",
        });
      }

      try {
        const communityDid = await getAtmosphereCommunityDid();
        const membership = await getMembership({
          communityDid,
          userDid: loggedInUser.did,
        });
        if (!membership.isMember && !membership.isAdmin) {
          return { outcome: "not-member" };
        }

        const sourceRepo = input.sourceRepo ?? loggedInUser.handle;
        const candidate = await getShareCandidateByUri(
          sourceRepo,
          input.candidateUri,
        );
        if (!candidate) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "That item couldn't be shared. Pick another one and try again.",
          });
        }

        await shareContentWithCommunity({
          communityDid,
          userDid: loggedInUser.did,
          candidate,
        });
        return { outcome: "ok" };
      } catch (error) {
        if (error instanceof ActionError) {
          throw error;
        }
        if (error instanceof OpenSocialCommunityError) {
          if (error.code === "PermissionDenied") {
            throw new ActionError({
              code: "FORBIDDEN",
              message: getShareErrorMessage("FORBIDDEN"),
            });
          }
        }
        if (isPermissionError(error)) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: getShareErrorMessage("FORBIDDEN"),
          });
        }
        console.warn("[shareAtmosphereContent] unexpected error", error);
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: getShareErrorMessage("INTERNAL_SERVER_ERROR"),
        });
      }
    },
  }),

  unshareAtmosphereContent: defineAction({
    accept: "form",
    input: z.object({
      shareRecordUri: z.string().min(1),
    }),
    handler: async (
      input,
      ctx,
    ): Promise<{ outcome: UnshareOutcomeCode; shareRecordUri: string }> => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "Sign in first, then try unsharing again.",
        });
      }

      try {
        const communityDid = await getAtmosphereCommunityDid();
        const parsedShareRecordUri = parseSharedContentRecordUri({
          uri: input.shareRecordUri,
          communityDid,
        });
        if (!parsedShareRecordUri) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "That item couldn't be removed. Refresh the page and try again.",
          });
        }

        const sharedRecord = await loadSharedDocumentRef({
          shareRecordUri: input.shareRecordUri,
          communityDid,
          shareRecordRkey: parsedShareRecordUri.rkey,
        });
        await assertCanUnshare({
          sharedRecord,
          loggedInUser,
          communityDid,
        });

        await unshareContentWithCommunity({
          communityDid,
          userDid: loggedInUser.did,
          shareRecordRkey: sharedRecord.shareRecordRkey,
        });
        return { outcome: "ok", shareRecordUri: input.shareRecordUri };
      } catch (error) {
        if (error instanceof ActionError) {
          throw error;
        }
        if (error instanceof OpenSocialCommunityError) {
          if (error.code === "RecordNotFound") {
            return { outcome: "missing", shareRecordUri: input.shareRecordUri };
          }
          if (error.code === "PermissionDenied") {
            throw new ActionError({
              code: "FORBIDDEN",
              message: getShareErrorMessage("FORBIDDEN"),
            });
          }
        }
        if (isPermissionError(error)) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: getShareErrorMessage("FORBIDDEN"),
          });
        }
        console.warn("[unshareAtmosphereContent] unexpected error", error);
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: getShareErrorMessage("INTERNAL_SERVER_ERROR"),
        });
      }
    },
  }),
};
