import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { AtUri } from "@atproto/api";

import { type RsvpOutcomeCode } from "../lib/community/rsvp-status";
import {
  RSVP_STATUS_GOING,
  RSVP_STATUS_NOT_GOING,
  setRsvpStatus,
  type RsvpStatus,
} from "../lib/rsvps";

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

export const rsvpActions = {
  rsvpEvent: defineAction({
    accept: "form",
    input: z.object({
      eventUri: z.string(),
      eventCid: z.string(),
      eventName: z.string().optional(),
      status: z.enum(["going", "notgoing"]),
    }),
    handler: async (input, ctx): Promise<{ outcome: RsvpOutcomeCode; eventName: string | null }> => {
      const loggedInUser = ctx.locals.loggedInUser;

      if (!loggedInUser) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "You need to sign in to RSVP.",
        });
      }

      if (!isValidEventUri(input.eventUri) || input.eventCid.length === 0) {
        throw new ActionError({ code: "BAD_REQUEST", message: "That RSVP request is invalid." });
      }

      try {
        await setRsvpStatus(
          loggedInUser,
          { uri: input.eventUri, cid: input.eventCid },
          FORM_STATUS_TO_RSVP_STATUS[input.status],
        );
      } catch (error) {
        if (isPermissionError(error)) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Your login is missing permission to RSVP to events.",
          });
        }
        console.warn("[rsvpEvent] unexpected error", error);
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "We couldn't update your RSVP right now. Please try again.",
        });
      }

      return { outcome: input.status, eventName: input.eventName ?? null };
    },
  }),
};
