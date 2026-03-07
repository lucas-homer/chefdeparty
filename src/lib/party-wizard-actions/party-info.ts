import type { UIMessageStreamWriter } from "ai";
import type { WizardMessage, StepConfirmationRequest } from "../wizard-message-types";
import type { PartyInfoData } from "../wizard-schemas";
import { parsePartyDateTimeInput } from "../party-date-parser";
import { updateSessionState, type WizardActionContext } from "./shared";

// ============================================
// Update Party Info Action
// ============================================

export interface UpdatePartyInfoActionContext extends WizardActionContext {
  referenceNow?: Date;
}

export interface UpdatePartyInfoActionInput {
  name?: string;
  dateTimeInput?: string;
  resolvedDateTime?: Date;
  location?: string;
  description?: string;
  allowContributions?: boolean;
}

export type UpdatePartyInfoActionResult =
  | {
      success: false;
      error: string;
      message?: string;
    }
  | {
      success: true;
      action: "updatePartyInfo";
      partyInfo: PartyInfoData;
      message: string;
    };

export async function updatePartyInfoAction(
  context: UpdatePartyInfoActionContext,
  input: UpdatePartyInfoActionInput
): Promise<UpdatePartyInfoActionResult> {
  const existing = context.currentData.partyInfo;
  const referenceNow = context.referenceNow || new Date();

  // Parse date if provided
  let parsedDate: Date | undefined;
  if (input.resolvedDateTime) {
    parsedDate = new Date(input.resolvedDateTime);
  } else if (input.dateTimeInput) {
    const parsed = parsePartyDateTimeInput(input.dateTimeInput, referenceNow);
    if (!parsed) {
      return {
        success: false,
        error: "I couldn't understand that date/time. Please provide a specific date (e.g., \"Saturday at 7pm\" or \"March 15 at 6pm\").",
      };
    }
    parsedDate = parsed.date;
  }

  // Merge with existing data
  const partyInfo: PartyInfoData = {
    name: input.name ?? existing?.name ?? "",
    dateTime: parsedDate ?? (existing?.dateTime ? new Date(existing.dateTime) : new Date(0)),
    location: input.location !== undefined ? input.location : existing?.location,
    description: input.description !== undefined ? input.description : existing?.description,
    allowContributions: input.allowContributions ?? existing?.allowContributions ?? false,
  };

  // Update currentData in place (same pattern as addGuestAction)
  context.currentData.partyInfo = partyInfo;
  await updateSessionState(context, { partyInfo });

  return {
    success: true,
    action: "updatePartyInfo",
    partyInfo,
    message: "Updated party details.",
  };
}

// ============================================
// Confirm Party Info Action
// ============================================

export interface ConfirmPartyInfoActionContext extends WizardActionContext {
  writer?: UIMessageStreamWriter<WizardMessage>;
}

export type ConfirmPartyInfoActionResult =
  | {
      success: false;
      error: string;
      message?: string;
    }
  | {
      success: true;
      action: "awaitingConfirmation";
      message: string;
      partyInfo: PartyInfoData;
      request: StepConfirmationRequest;
    };

export async function confirmPartyInfoAction(
  context: ConfirmPartyInfoActionContext
): Promise<ConfirmPartyInfoActionResult> {
  const partyInfo = context.currentData.partyInfo;

  if (!partyInfo || !partyInfo.name || !partyInfo.dateTime) {
    return {
      success: false,
      error: "Party details are incomplete. Please provide at least a name and date/time first.",
    };
  }

  const request: StepConfirmationRequest = {
    id: crypto.randomUUID(),
    step: "party-info",
    nextStep: "guests",
    summary: `Party: ${partyInfo.name} on ${new Date(partyInfo.dateTime).toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}${partyInfo.location ? ` at ${partyInfo.location}` : ""}`,
    data: { partyInfo },
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
    message: "Please confirm the party details above.",
    partyInfo,
    request,
  };
}
