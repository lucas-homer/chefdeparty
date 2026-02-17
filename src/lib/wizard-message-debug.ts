import type { UIMessage } from "ai";
import {
  getPartType,
  getToolOutputMessage,
  isNonEmptyTextPart,
} from "./wizard-message-parts";

type MessagePart = UIMessage["parts"][number];

function isVisiblePart(part: MessagePart): boolean {
  const partType = getPartType(part);

  if (isNonEmptyTextPart(part)) {
    return true;
  }

  if (partType === "step-start") {
    return false;
  }

  if (partType === "data-step-confirmation-request") {
    const candidate = part as { data?: { request?: { id?: string } } };
    const requestId = candidate.data?.request?.id;
    if (!requestId) return false;
    return true;
  }

  if (partType === "data-step-confirmation-decision") {
    return true;
  }

  if (partType === "data-step-confirmed") {
    return true;
  }

  if (partType === "data-recipe-extracted") {
    return true;
  }

  if (partType === "data-timeline-generated") {
    return true;
  }

  if (partType === "tool-result") {
    const partWithResult = part as { result?: { message?: unknown } };
    return typeof partWithResult.result?.message === "string" &&
      partWithResult.result.message.trim().length > 0;
  }

  if (partType.startsWith("tool-")) {
    return getToolOutputMessage(part) !== null;
  }

  if (partType.startsWith("tool-") || partType.startsWith("data-")) {
    return false;
  }

  return false;
}

export interface WizardMessageDebugSummary {
  id: string;
  role: string;
  partTypes: string[];
  visiblePartTypes: string[];
  hasVisibleContent: boolean;
  toolOutputMessages: string[];
}

export function summarizeWizardMessage(
  message: UIMessage
): WizardMessageDebugSummary {
  const partTypes = message.parts.map(getPartType);
  const visiblePartTypes: string[] = [];
  const toolOutputMessages: string[] = [];

  for (const part of message.parts) {
    const partType = getPartType(part);
    if (isVisiblePart(part)) {
      visiblePartTypes.push(partType);
    }

    const toolOutputMessage = getToolOutputMessage(part);
    if (toolOutputMessage) {
      toolOutputMessages.push(toolOutputMessage);
    }
  }

  return {
    id: message.id,
    role: message.role,
    partTypes,
    visiblePartTypes,
    hasVisibleContent: visiblePartTypes.length > 0,
    toolOutputMessages,
  };
}
