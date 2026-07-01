import { actions } from "astro:actions";

import { getRsvpNotice } from "./notice";

const RSVP_GOING = "community.lexicon.calendar.rsvp#going";
const RSVP_NOT_GOING = "community.lexicon.calendar.rsvp#notgoing";

let toastTimeout: ReturnType<typeof setTimeout> | undefined;

function showToast(
  element: HTMLElement,
  text: string,
  tone: "success" | "neutral" | "error",
) {
  document.querySelectorAll<HTMLElement>("[data-rsvp-message]").forEach((message) => {
    if (message !== element) {
      message.hidden = true;
    }
  });

  element.textContent = text;
  element.dataset.tone = tone;
  element.hidden = false;

  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
  if (tone !== "error") {
    toastTimeout = setTimeout(() => {
      element.hidden = true;
    }, 3500);
  }
}

export function bindRsvpForms() {
  document.querySelectorAll<HTMLFormElement>("form[data-rsvp-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const card = form.closest<HTMLElement>(".event-card");
      const button = form.querySelector<HTMLButtonElement>("[data-rsvp-button]");
      const statusInput = form.querySelector<HTMLInputElement>(
        "[data-rsvp-status-input]",
      );
      const message = card?.querySelector<HTMLElement>("[data-rsvp-message]");
      const goingBadge = card?.querySelector<HTMLElement>('[data-rsvp-badge="going"]');
      const savedBadge = card?.querySelector<HTMLElement>('[data-rsvp-badge="saved"]');
      if (!card || !button || !statusInput) {
        return;
      }

      const formData = new FormData(form);
      const buttonEventName = button.dataset.eventName ?? "";

      button.disabled = true;
      if (message) {
        message.hidden = true;
      }

      const result = await actions.rsvpEvent(formData);

      button.disabled = false;

      const noticeEventName = result.data?.eventName ?? buttonEventName;
      const notice = getRsvpNotice(result, noticeEventName || null);

      if (result.error || !result.data) {
        if (message && notice) {
          showToast(message, notice.message, notice.tone);
        }
        return;
      }

      const nowGoing = result.data.outcome === "going";
      card.dataset.rsvpStatus = nowGoing ? RSVP_GOING : RSVP_NOT_GOING;

      if (goingBadge) {
        goingBadge.hidden = !nowGoing;
      }
      if (savedBadge) {
        savedBadge.hidden = true;
      }

      button.textContent = nowGoing ? "I'm not going" : "I'm going";
      button.classList.toggle("event-card__rsvp--cancel", nowGoing);
      button.setAttribute(
        "aria-label",
        nowGoing
          ? `Mark yourself as not going to ${noticeEventName}`
          : `Mark yourself as going to ${noticeEventName}`,
      );
      statusInput.value = nowGoing ? "notgoing" : "going";

      if (message && notice) {
        showToast(message, notice.message, notice.tone);
      }
    });
  });
}
