import type { UIMessageStreamWriter } from "ai";
import type { WizardMessage, StepConfirmationRequest } from "../wizard-message-types";
import type { GuestData } from "../wizard-schemas";
import {
  cleanOptionalString,
  looksLikeEmail,
  updateSessionState,
  type WizardActionContext,
} from "./shared";

export interface GuestsActionContext extends WizardActionContext {
  writer?: UIMessageStreamWriter<WizardMessage>;
}

export interface GuestInput {
  name?: string;
  email?: string;
  phone?: string;
}

export function normalizeGuestInput(data: GuestInput): GuestData | null {
  let name = cleanOptionalString(data.name);
  let email = cleanOptionalString(data.email);
  const phone = cleanOptionalString(data.phone);

  if (email && !looksLikeEmail(email)) {
    if (!name) {
      name = email;
    }
    email = undefined;
  }

  if (!name && !email && !phone) {
    return null;
  }

  return {
    name,
    email,
    phone,
  };
}

export type AddGuestActionResult =
  | {
      success: false;
      error: string;
      message: string;
    }
  | {
      success: true;
      action: "updateGuestList";
      guestList: GuestData[];
      message: string;
      guest: GuestData;
    };

export async function addGuestAction(
  context: GuestsActionContext,
  input: GuestInput
): Promise<AddGuestActionResult> {
  const normalizedGuest = normalizeGuestInput(input);
  if (!normalizedGuest) {
    return {
      success: false,
      error: "Missing guest details.",
      message: "I need at least a name, email, or phone number to add a guest.",
    };
  }

  const guestList: GuestData[] = [...(context.currentData.guestList || [])];
  guestList.push(normalizedGuest);

  context.currentData.guestList = guestList;
  await updateSessionState(context, { guestList });

  return {
    success: true,
    action: "updateGuestList",
    guestList,
    guest: normalizedGuest,
    message: normalizedGuest.email || normalizedGuest.phone
      ? `Added ${normalizedGuest.name || normalizedGuest.email || normalizedGuest.phone} to the guest list.`
      : `Added ${normalizedGuest.name || "guest"} to the guest list. You can add contact details later.`,
  };
}

export type RemoveGuestActionResult =
  | { success: false; error: string }
  | {
      success: true;
      action: "updateGuestList";
      guestList: GuestData[];
      message: string;
      removed: GuestData;
    };

export async function removeGuestAction(
  context: GuestsActionContext,
  input: { index: number }
): Promise<RemoveGuestActionResult> {
  const guestList: GuestData[] = [...(context.currentData.guestList || [])];
  if (input.index < 0 || input.index >= guestList.length) {
    return { success: false, error: "Invalid guest index" };
  }

  const removed = guestList.splice(input.index, 1)[0];

  context.currentData.guestList = guestList;
  await updateSessionState(context, { guestList });

  return {
    success: true,
    action: "updateGuestList",
    guestList,
    removed,
    message: `Removed ${removed.name || removed.email || removed.phone} from the guest list.`,
  };
}

export type ConfirmGuestListActionResult = {
  success: true;
  action: "awaitingConfirmation";
  message: string;
  request: StepConfirmationRequest;
};

export async function confirmGuestListAction(
  context: GuestsActionContext
): Promise<ConfirmGuestListActionResult> {
  const guestList = context.currentData.guestList || [];
  const guestCount = guestList.length;
  const guestNames = guestList
    .slice(0, 3)
    .map((g) => g.name || g.email || g.phone)
    .join(", ");

  const request: StepConfirmationRequest = {
    id: crypto.randomUUID(),
    step: "guests",
    nextStep: "menu",
    summary: guestCount === 0
      ? "No guests added yet (you can add them later)"
      : `${guestCount} guest${guestCount === 1 ? "" : "s"}: ${guestNames}${guestCount > 3 ? "..." : ""}`,
    data: { guestList },
  };

  if (context.writer) {
    context.writer.write({
      type: "data-step-confirmation-request",
      data: { request },
    });
  }

  return {
    success: true,
    action: "awaitingConfirmation",
    message: "Please confirm the guest list above.",
    request,
  };
}

function normalizeLookup(value: string | undefined): string {
  return (value || "").trim().toLowerCase();
}

export function findGuestMatchIndexes(
  guestList: GuestData[],
  target: { name?: string; email?: string; phone?: string }
): number[] {
  const name = normalizeLookup(target.name);
  const email = normalizeLookup(target.email);
  const phone = normalizeLookup(target.phone);

  return guestList
    .map((guest, index) => ({ guest, index }))
    .filter(({ guest }) => {
      if (email && normalizeLookup(guest.email) === email) return true;
      if (phone && normalizeLookup(guest.phone) === phone) return true;
      if (name && normalizeLookup(guest.name) === name) return true;
      return false;
    })
    .map(({ index }) => index);
}
