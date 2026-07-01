import { membershipActions } from "../features/community-membership/action";
import { sharingActions } from "../features/community-sharing/action";
import { rsvpActions } from "../features/event-rsvp/action";

export const server = {
  ...membershipActions,
  ...sharingActions,
  ...rsvpActions,
};
