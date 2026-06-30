import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { AtUri } from "@atproto/api";

import { getAtmosphereCommunityDid } from "../lib/community/atmosphere";
import { resolveHandleToDid } from "../lib/community/identity";
import { type JoinStatusCode } from "../lib/community/join-status";
import {
  type ShareStatusCode,
  type UnshareStatusCode,
} from "../lib/community/share-status";
import { runJoin, runLeave } from "../lib/community/membership-mutations";
import { parseSharedDocumentRef } from "../lib/community/shared-content";
import {
  getRepoRecordByUri,
  getShareCandidateByUri,
} from "../lib/community/share-candidates";
import {
  OpenSocialCommunityError,
  getMembership,
} from "../lib/opensocial/membership";
import {
  SHARED_CONTENT_COLLECTION,
  shareContentWithCommunity,
  unshareContentWithCommunity,
} from "../lib/opensocial/content-sharing";
import {
  RSVP_STATUS_GOING,
  RSVP_STATUS_NOT_GOING,
  setRsvpStatus,
  type RsvpStatus,
} from "../lib/rsvps";


function joinPayload(status: JoinStatusCode, community?: string) {
  return { status, community };
}

const EVENT_COLLECTION = "community.lexicon.calendar.event";

function isValidEventUri(uri: string): boolean {
  try {
    const parsed = new AtUri(uri);
    return (
      parsed.host.startsWith("did:") &&
      parsed.collection === EVENT_COLLECTION &&
      parsed.rkey.length > 0
    );
  } catch {
    return false;
  }
}

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

const FORM_STATUS_TO_RSVP_STATUS: Record<"going" | "notgoing", RsvpStatus> = {
  going: RSVP_STATUS_GOING,
  notgoing: RSVP_STATUS_NOT_GOING,
};

function throwActionError(
  code: "UNAUTHORIZED" | "FORBIDDEN" | "BAD_REQUEST" | "INTERNAL_SERVER_ERROR",
  message: string,
): never {
  throw new ActionError({ code, message });
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

export const server = {
  joinAtmosphereCommunity: defineAction({
    accept: "form",
    handler: async (_input, ctx) => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        return joinPayload("signin");
      }
      const status = await runJoin(loggedInUser, await getAtmosphereCommunityDid());
      return joinPayload(status);
    },
  }),

  // Listing-page join for any opensocial community, addressed by handle.
  joinOpenSocialCommunity: defineAction({
    accept: "form",
    input: z.object({ handle: z.string().min(1) }),
    handler: async (input, ctx) => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        return joinPayload("signin", input.handle);
      }
      let communityDid: string;
      try {
        communityDid = await resolveHandleToDid(input.handle);
      } catch {
        return joinPayload("missing", input.handle);
      }
      const status = await runJoin(loggedInUser, communityDid);
      return joinPayload(status, input.handle);
    },
  }),

  // Listing-page leave for any opensocial community, addressed by handle.
  leaveOpenSocialCommunity: defineAction({
    accept: "form",
    input: z.object({ handle: z.string().min(1) }),
    handler: async (input, ctx) => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        return joinPayload("signin", input.handle);
      }
      let communityDid: string;
      try {
        communityDid = await resolveHandleToDid(input.handle);
      } catch {
        return joinPayload("missing", input.handle);
      }
      const status = await runLeave(loggedInUser, communityDid);
      return joinPayload(status, input.handle);
    },
  }),

  leaveAtmosphereCommunity: defineAction({
    accept: "form",
    handler: async (_input, ctx) => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        return joinPayload("signin");
      }
      const status = await runLeave(loggedInUser, await getAtmosphereCommunityDid());
      return joinPayload(status);
    },
  }),

  shareAtmosphereContent: defineAction({
    accept: "form",
    input: z.object({
      candidateUri: z.string().min(1),
      sourceRepo: z.string().min(1).optional(),
    }),
    handler: async (input, ctx): Promise<{ status: ShareStatusCode }> => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        return { status: "signin" };
      }

      try {
        const communityDid = await getAtmosphereCommunityDid();
        const membership = await getMembership({
          communityDid,
          userDid: loggedInUser.did,
        });
        if (!membership.isMember && !membership.isAdmin) {
          return { status: "not-member" };
        }

        const sourceRepo = input.sourceRepo ?? loggedInUser.handle;
        const candidate = await getShareCandidateByUri(
          sourceRepo,
          input.candidateUri,
        );
        if (!candidate) {
          return { status: "not-found" };
        }

        await shareContentWithCommunity({
          communityDid,
          userDid: loggedInUser.did,
          candidate,
        });
        return { status: "ok" };
      } catch (err) {
        if (err instanceof OpenSocialCommunityError) {
          if (err.code === "PermissionDenied") {
            return { status: "no-permission" };
          }
          console.warn("[shareAtmosphereContent] OpenSocial error", err);
          return { status: "failed" };
        }
        if (isPermissionError(err)) {
          return { status: "no-permission" };
        }
        console.warn("[shareAtmosphereContent] unexpected error", err);
        return { status: "failed" };
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
    ): Promise<{ status: UnshareStatusCode; shareRecordUri: string }> => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        return { status: "signin", shareRecordUri: input.shareRecordUri };
      }

      try {
        const communityDid = await getAtmosphereCommunityDid();
        const parsedShareRecordUri = parseSharedContentRecordUri(
          input.shareRecordUri,
          communityDid,
        );
        if (!parsedShareRecordUri) {
          return { status: "not-found", shareRecordUri: input.shareRecordUri };
        }

        const response = await getRepoRecordByUri(input.shareRecordUri);
        if (!response || typeof response.value !== "object" || response.value === null) {
          return { status: "not-found", shareRecordUri: input.shareRecordUri };
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
          return { status: "not-found", shareRecordUri: input.shareRecordUri };
        }

        const isOriginalSharer = sharedRecord.sharedBy === loggedInUser.did;
        if (!isOriginalSharer) {
          const membership = await getMembership({
            communityDid,
            userDid: loggedInUser.did,
          });
          if (!membership.isAdmin) {
            return { status: "not-author", shareRecordUri: input.shareRecordUri };
          }
        }

        await unshareContentWithCommunity({
          communityDid,
          userDid: loggedInUser.did,
          shareRecordRkey: sharedRecord.shareRecordRkey,
        });
        return { status: "ok", shareRecordUri: input.shareRecordUri };
      } catch (err) {
        if (err instanceof OpenSocialCommunityError) {
          if (err.code === "RecordNotFound") {
            return { status: "missing", shareRecordUri: input.shareRecordUri };
          }
          if (err.code === "PermissionDenied") {
            return { status: "no-permission", shareRecordUri: input.shareRecordUri };
          }
          console.warn("[unshareAtmosphereContent] OpenSocial error", err);
          return { status: "failed", shareRecordUri: input.shareRecordUri };
        }
        if (isPermissionError(err)) {
          return { status: "no-permission", shareRecordUri: input.shareRecordUri };
        }
        console.warn("[unshareAtmosphereContent] unexpected error", err);
        return { status: "failed", shareRecordUri: input.shareRecordUri };
      }
    },
  }),


  rsvpEvent: defineAction({
    accept: "form",
    input: z.object({
      eventUri: z.string(),
      eventCid: z.string(),
      eventName: z.string().optional(),
      status: z.enum(["going", "notgoing"]),
    }),
    handler: async (input, ctx) => {
      const loggedInUser = ctx.locals.loggedInUser;

      if (!loggedInUser) {
        throwActionError("UNAUTHORIZED", "You need to sign in to RSVP.");
      }

      if (!isValidEventUri(input.eventUri) || input.eventCid.length === 0) {
        throwActionError("BAD_REQUEST", "That RSVP request is invalid.");
      }

      try {
        await setRsvpStatus(
          loggedInUser,
          { uri: input.eventUri, cid: input.eventCid },
          FORM_STATUS_TO_RSVP_STATUS[input.status],
        );
      } catch (error) {
        throwActionError(
          isPermissionError(error) ? "FORBIDDEN" : "INTERNAL_SERVER_ERROR",
          isPermissionError(error)
            ? "Your login is missing permission to RSVP to events."
            : "We couldn't update your RSVP right now. Please try again.",
        );
      }

      return { status: input.status, eventName: input.eventName ?? null };
    },
  }),
};
