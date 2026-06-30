export type RsvpOutcomeCode =
  | "going"
  | "notgoing";

type RsvpStatusEntry = {
  tone: "success" | "neutral" | "error";
  message: (eventName: string | null) => string;
};

export type RsvpStatusCopy = {
  tone: "success" | "neutral" | "error";
  message: string;
};

const RSVP_OUTCOME_COPY: Record<RsvpOutcomeCode, RsvpStatusEntry> = {
  going: {
    tone: "success",
    message: (name) =>
      name ? `You're going to ${name}.` : "You're marked as going.",
  },
  notgoing: {
    tone: "neutral",
    message: (name) =>
      name ? `You're no longer going to ${name}.` : "You're no longer marked as going.",
  },
};

export function getRsvpOutcomeCopy(
  outcome: RsvpOutcomeCode | null | undefined,
  eventName: string | null = null,
): RsvpStatusCopy | null {
  if (!outcome) {
    return null;
  }
  const entry = RSVP_OUTCOME_COPY[outcome];
  return {
    tone: entry.tone,
    message: entry.message(eventName),
  };
}
