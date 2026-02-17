import type { UIMessageStreamWriter } from "ai";
import type { WizardMessage, StepConfirmationRequest } from "../wizard-message-types";
import type { PartyInfoData } from "../wizard-schemas";
import { parsePartyDateTimeInput } from "../party-date-parser";
import { updateSessionState, type WizardActionContext } from "./shared";

export interface ConfirmPartyInfoActionContext extends WizardActionContext {
  referenceNow?: Date;
  writer?: UIMessageStreamWriter<WizardMessage>;
}

export interface ConfirmPartyInfoActionInput {
  name: string;
  dateTimeInput?: string;
  dateTime?: string;
  resolvedDateTime?: Date;
  location?: string;
  description?: string;
  allowContributions?: boolean;
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
  context: ConfirmPartyInfoActionContext,
  input: ConfirmPartyInfoActionInput
): Promise<ConfirmPartyInfoActionResult> {
  const rawDateInput = input.dateTimeInput || input.dateTime;
  const referenceNow = context.referenceNow || new Date();

  const parsedDate = input.resolvedDateTime
    ? new Date(input.resolvedDateTime)
    : rawDateInput
      ? parsePartyDateTimeInput(rawDateInput, referenceNow)
      : null;

  if (!parsedDate) {
    return {
      success: false,
      error: "I couldn't understand that date/time. Please provide a specific date (e.g., \"Saturday at 7pm\" or \"March 15 at 6pm\").",
    };
  }

  const partyInfo: PartyInfoData = {
    name: input.name,
    dateTime: parsedDate,
    location: input.location,
    description: input.description,
    allowContributions: input.allowContributions || false,
  };

  await updateSessionState(context, {
    partyInfo,
  });

  const request: StepConfirmationRequest = {
    id: crypto.randomUUID(),
    step: "party-info",
    nextStep: "guests",
    summary: `Party: ${input.name} on ${parsedDate.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}${input.location ? ` at ${input.location}` : ""}`,
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
