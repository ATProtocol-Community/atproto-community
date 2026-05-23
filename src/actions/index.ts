// TODO: refactor onto @fujocoded/astro-smooth-action once it's officially out.
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
import {
  OpenSocialCommunityError,
  ensureUserMembershipRecord,
  getMembership,
  joinCommunity,
  leaveCommunity,
} from "../lib/opensocial/membership";

function joinRedirect(status: string): string {
  return `/community-content?join=${encodeURIComponent(status)}`;
}

function joinStatusFromError(err: OpenSocialCommunityError): string {
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

function leaveStatusFromError(err: OpenSocialCommunityError): string {
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
        return { redirectUrl: joinRedirect("signin") };
      }
      try {
        const communityDid = await getAtmosphereCommunityDid();
        const membership = await getMembership({
          communityDid,
          userDid: loggedInUser.did,
        });
        if (membership.isMember) {
          return { redirectUrl: joinRedirect("already") };
        }
        const membershipRecord = await ensureUserMembershipRecord({
          loggedInUser,
          communityDid,
        });
        const result = await joinCommunity({
          communityDid,
          userDid: loggedInUser.did,
          membershipCid: membershipRecord.cid,
        });
        return {
          redirectUrl: joinRedirect(result.status === "pending" ? "pending" : "ok"),
        };
      } catch (err) {
        if (err instanceof OpenSocialCommunityError) {
          return { redirectUrl: joinRedirect(joinStatusFromError(err)) };
        }
        if (isPermissionError(err)) {
          return { redirectUrl: joinRedirect("permission") };
        }
        console.warn("[joinAtmosphereCommunity] unexpected error", err);
        return { redirectUrl: joinRedirect("error") };
      }
    },
  }),

  leaveAtmosphereCommunity: defineAction({
    accept: "form",
    handler: async (_input, ctx) => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        return { redirectUrl: joinRedirect("signin") };
      }
      try {
        const communityDid = await getAtmosphereCommunityDid();
        await leaveCommunity({
          communityDid,
          userDid: loggedInUser.did,
        });
        return { redirectUrl: joinRedirect("left") };
      } catch (err) {
        if (err instanceof OpenSocialCommunityError) {
          return { redirectUrl: joinRedirect(leaveStatusFromError(err)) };
        }
        console.warn("[leaveAtmosphereCommunity] unexpected error", err);
        return { redirectUrl: joinRedirect("error") };
      }
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
