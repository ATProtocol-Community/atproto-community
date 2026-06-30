import { membershipActions } from "./membership";
import { sharingActions } from "./sharing";
import { rsvpActions } from "./rsvp";

export const server = {
  ...membershipActions,
  ...sharingActions,
  ...rsvpActions,
};
