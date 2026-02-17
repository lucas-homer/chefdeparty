import type { UIMessage } from "ai";

export type WizardMessagePart = UIMessage["parts"][number];

const SESSION_REFRESH_ACTIONS = new Set([
  "updateGuestList",
  "updateMenuPlan",
  "updateTimeline",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getPartType(part: WizardMessagePart): string {
  return typeof part.type === "string" ? part.type : "unknown";
}

export function isNonEmptyTextPart(part: WizardMessagePart): boolean {
  if (getPartType(part) !== "text") return false;
  const partWithText = part as { text?: unknown };
  return typeof partWithText.text === "string" && partWithText.text.trim().length > 0;
}

export function hasNonEmptyTextPart(message: UIMessage): boolean {
  return message.parts.some(isNonEmptyTextPart);
}

export function getToolPartOutput(part: WizardMessagePart): Record<string, unknown> | null {
  const partType = getPartType(part);
  if (!partType.startsWith("tool-")) return null;

  const candidate = part as {
    state?: unknown;
    output?: unknown;
    result?: unknown;
  };

  if (candidate.state === "output-available" && isObject(candidate.output)) {
    return candidate.output;
  }

  if (isObject(candidate.result)) {
    return candidate.result;
  }

  return null;
}

export function getToolOutputMessage(part: WizardMessagePart): string | null {
  const output = getToolPartOutput(part);
  if (!output) return null;

  const message = output.message;
  if (typeof message !== "string") return null;

  const trimmed = message.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function shouldRefreshSessionFromToolPart(part: WizardMessagePart): boolean {
  const output = getToolPartOutput(part);
  if (!output) return false;

  const action = output.action;
  return typeof action === "string" && SESSION_REFRESH_ACTIONS.has(action);
}

export function shouldRefreshSessionFromAssistantMessage(message: UIMessage): boolean {
  return message.parts.some(shouldRefreshSessionFromToolPart);
}
