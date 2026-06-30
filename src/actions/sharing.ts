import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { AtUri } from "@atproto/api";

import { getAtmosphereCommunityDid } from "../lib/community/atmosphere";
import {
  type ShareOutcomeCode,
  type UnshareOutcomeCode,
} from "../lib/community/share-status";
import { parseSharedDocumentRef } from "../lib/community/shared-content";
import {
  getRepoRecordByUri,
  getShareCandidateByUri,
} from "../lib/community/share-candidates";
import { getMembership } from "../lib/opensocial/membership";
import { OpenSocialCommunityError } from "../lib/opensocial/client";
import {
  SHARED_CONTENT_COLLECTION,
  shareContentWithCommunity,
  unshareContentWithCommunity,
} from "../lib/opensocial/content-sharing";

function parseSharedContentRecordUri(
  uri: string,
  communityDid: string,
): AtUri | null {
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

function isPermissionError(error: unknown): boolean {
  const maybeError = error as {
    status?: number;
    error?: string;
    message?: string;
  };
  const text = `${maybeError.error ?? ""} ${
    maybeError.message ?? ""
  }`.toLowerCase();
  return (
    maybeError.status === 401 ||
    maybeError.status === 403 ||
    text.includes("scope")
  );
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
      } catch (err) {
        if (err instanceof ActionError) {
          throw err;
        }
        if (err instanceof OpenSocialCommunityError) {
          if (err.code === "PermissionDenied") {
            throw new ActionError({
              code: "FORBIDDEN",
              message:
                "Your login needs community content permission. Log out and back in, then try again.",
            });
          }
        }
        if (isPermissionError(err)) {
          throw new ActionError({
            code: "FORBIDDEN",
            message:
              "Your login needs community content permission. Log out and back in, then try again.",
          });
        }
        console.warn("[shareAtmosphereContent] unexpected error", err);
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Something went wrong while updating community content. Try again later.",
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
        const parsedShareRecordUri = parseSharedContentRecordUri(
          input.shareRecordUri,
          communityDid,
        );
        if (!parsedShareRecordUri) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "That item couldn't be removed. Refresh the page and try again.",
          });
        }

        const response = await getRepoRecordByUri(input.shareRecordUri);
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
            shareRecordRkey: parsedShareRecordUri.rkey,
          },
        );
        if (!sharedRecord) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "That item couldn't be removed. Refresh the page and try again.",
          });
        }

        const isOriginalSharer = sharedRecord.sharedBy === loggedInUser.did;
        if (!isOriginalSharer) {
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

        await unshareContentWithCommunity({
          communityDid,
          userDid: loggedInUser.did,
          shareRecordRkey: sharedRecord.shareRecordRkey,
        });
        return { outcome: "ok", shareRecordUri: input.shareRecordUri };
      } catch (err) {
        if (err instanceof ActionError) {
          throw err;
        }
        if (err instanceof OpenSocialCommunityError) {
          if (err.code === "RecordNotFound") {
            return { outcome: "missing", shareRecordUri: input.shareRecordUri };
          }
          if (err.code === "PermissionDenied") {
            throw new ActionError({
              code: "FORBIDDEN",
              message:
                "Your login needs community content permission. Log out and back in, then try again.",
            });
          }
        }
        if (isPermissionError(err)) {
          throw new ActionError({
            code: "FORBIDDEN",
            message:
              "Your login needs community content permission. Log out and back in, then try again.",
          });
        }
        console.warn("[unshareAtmosphereContent] unexpected error", err);
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Something went wrong while updating community content. Try again later.",
        });
      }
    },
  }),
};
