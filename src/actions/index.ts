// TODO: refactor onto @fujocoded/astro-smooth-actions.
// Drops cleanRedirect / redirectWithStatus / isPermissionError / redirectUrl return shape:
// throw ActionError for failures, return { status, eventName }, let middleware do PRG via
// session storage. Also remove the `redirect` form field and the `?rsvp=&event=` query-param
// channel in events.astro + EventCard.astro.

import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { AtUri } from "@atproto/api";

import {
  RSVP_STATUS_GOING,
  RSVP_STATUS_NOT_GOING,
  setRsvpStatus,
  type RsvpStatus,
} from "../lib/rsvps";
import { getAtmosphereCommunityDid } from "../lib/community/atmosphere";
import { resolveHandleToDid } from "../lib/community/identity";
import {
  OpenSocialCommunityError,
  ensureUserMembershipRecord,
  getMembership,
  joinCommunity,
  leaveCommunity,
} from "../lib/opensocial/membership";
import {
  getShareCandidateByUri,
} from "../lib/community/share-candidates";
import { shareContentWithCommunity } from "../lib/opensocial/content-sharing";
import { type JoinStatusCode } from "../lib/community/join-status";

type LoggedInUser = NonNullable<App.Locals["loggedInUser"]>;

// Shared join flow for any opensocial community. Returns a status key (never
// throws) so each entry point can map it onto its own redirect target.
async function runJoin(
  loggedInUser: LoggedInUser,
  communityDid: string,
): Promise<JoinStatusCode> {
  try {
    const membership = await getMembership({
      communityDid,
      userDid: loggedInUser.did,
    });
    if (membership.isMember || membership.isAdmin) return "already";
    const membershipRecord = await ensureUserMembershipRecord({
      loggedInUser,
      communityDid,
    });
    const result = await joinCommunity({
      communityDid,
      userDid: loggedInUser.did,
      membershipCid: membershipRecord.cid,
    });
    return result.status === "pending" ? "pending" : "ok";
  } catch (err) {
    if (err instanceof OpenSocialCommunityError) return joinStatusFromError(err);
    if (isPermissionError(err)) return "permission";
    console.warn("[runJoin] unexpected error", err);
    return "error";
  }
}

// Shared leave flow for any opensocial community. Returns a status key (never
// throws). Admins get "admin-block" because the appview rejects their leave.
async function runLeave(
  loggedInUser: LoggedInUser,
  communityDid: string,
): Promise<JoinStatusCode> {
  try {
    await leaveCommunity({ communityDid, userDid: loggedInUser.did });
    return "left";
  } catch (err) {
    if (err instanceof OpenSocialCommunityError) return leaveStatusFromError(err);
    if (isPermissionError(err)) return "permission";
    console.warn("[runLeave] unexpected error", err);
    return "error";
  }
}

function joinStatusFromError(err: OpenSocialCommunityError): JoinStatusCode {
  switch (err.code) {
    case "AlreadyMember":
      return "already";
    case "AlreadyPending":
      return "pending";
    case "CommunityNotFound":
      return "missing";
    default:
      return "error";
  }
}

function leaveStatusFromError(err: OpenSocialCommunityError): JoinStatusCode {
  switch (err.code) {
    case "NotMember":
      return "not-member";
    case "CommunityNotFound":
      return "missing";
    case "CannotLeaveAsAdmin":
      return "admin-block";
    default:
      return "error";
  }
}

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

const FORM_STATUS_TO_RSVP_STATUS: Record<"going" | "notgoing", RsvpStatus> = {
  going: RSVP_STATUS_GOING,
  notgoing: RSVP_STATUS_NOT_GOING,
};

function redirectWithStatus(status: string): string {
  return `/events?rsvp=${encodeURIComponent(status)}`;
}

function shareRedirect(status: string): string {
  return `/community-content?share=${encodeURIComponent(status)}`;
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
    handler: async (input, ctx) => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        return { redirectUrl: shareRedirect("signin") };
      }

      try {
        const communityDid = await getAtmosphereCommunityDid();
        const membership = await getMembership({
          communityDid,
          userDid: loggedInUser.did,
        });
        if (!membership.isMember && !membership.isAdmin) {
          return { redirectUrl: shareRedirect("not-member") };
        }

        const sourceRepo = input.sourceRepo ?? loggedInUser.handle;
        const candidate = await getShareCandidateByUri(
          sourceRepo,
          input.candidateUri,
        );
        if (!candidate) {
          return { redirectUrl: shareRedirect("invalid") };
        }

        await shareContentWithCommunity({
          communityDid,
          userDid: loggedInUser.did,
          candidate,
        });
        return { redirectUrl: shareRedirect("ok") };
      } catch (err) {
        if (err instanceof OpenSocialCommunityError) {
          return {
            redirectUrl: shareRedirect(
              err.code === "PermissionDenied" ? "permission" : "error",
            ),
          };
        }
        if (isPermissionError(err)) {
          return { redirectUrl: shareRedirect("permission") };
        }
        console.warn("[shareAtmosphereContent] unexpected error", err);
        return { redirectUrl: shareRedirect("error") };
      }
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

  rsvpEvent: defineAction({
    accept: "form",
    input: z.object({
      eventUri: z.string(),
      eventCid: z.string(),
      status: z.enum(["going", "notgoing"]),
    }),
    handler: async (input, ctx) => {
      const loggedInUser = ctx.locals.loggedInUser;

      if (!loggedInUser) {
        return { redirectUrl: redirectWithStatus("error") };
      }

      if (!isValidEventUri(input.eventUri) || input.eventCid.length === 0) {
        return { redirectUrl: redirectWithStatus("error") };
      }

      try {
        await setRsvpStatus(
          loggedInUser,
          { uri: input.eventUri, cid: input.eventCid },
          FORM_STATUS_TO_RSVP_STATUS[input.status],
        );
      } catch (error) {
        return {
          redirectUrl: redirectWithStatus(
            isPermissionError(error) ? "permission" : "error",
          ),
        };
      }

      return {
        redirectUrl: redirectWithStatus(input.status),
      };
    },
  }),
};
