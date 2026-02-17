import type { UIMessage } from "ai";
import {
  getToolOutputMessage,
  hasNonEmptyTextPart,
  isToolPartError,
  shouldRefreshSessionFromAssistantMessage,
} from "./wizard-message-parts";

function buildAssistantMessage(parts: UIMessage["parts"]): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    parts,
    metadata: undefined,
  };
}

describe("wizard-message-parts", () => {
  it("extracts tool output message from AI SDK tool part", () => {
    const message = buildAssistantMessage([
      {
        type: "tool-addGuest",
        state: "output-available",
        input: { name: "Alice", email: "alice@example.com" },
        output: { action: "updateGuestList", message: "Added Alice to the guest list." },
      },
    ]);

    const toolPart = message.parts[0];
    expect(getToolOutputMessage(toolPart)).toBe("Added Alice to the guest list.");
  });

  it("detects session refresh requirement for guest/menu/timeline tool updates", () => {
    const message = buildAssistantMessage([
      {
        type: "tool-addGuest",
        state: "output-available",
        input: { name: "Alice", email: "alice@example.com" },
        output: { action: "updateGuestList", message: "Added Alice." },
      },
      {
        type: "tool-addExistingRecipe",
        state: "output-available",
        input: { recipeId: "abc" },
        output: { action: "updateMenuPlan", message: "Added recipe." },
      },
    ]);

    expect(shouldRefreshSessionFromAssistantMessage(message)).toBe(true);
  });

  it("does not require session refresh for text-only responses", () => {
    const message = buildAssistantMessage([{ type: "text", text: "Anyone else to add?" }]);

    expect(hasNonEmptyTextPart(message)).toBe(true);
    expect(shouldRefreshSessionFromAssistantMessage(message)).toBe(false);
  });

  it("detects session refresh requirement from data-session-refresh parts", () => {
    const message = buildAssistantMessage([
      {
        type: "data-session-refresh",
        data: { action: "updateGuestList" },
      },
    ]);

    expect(shouldRefreshSessionFromAssistantMessage(message)).toBe(true);
  });

  it("extracts a visible message from tool output-error parts", () => {
    const message = buildAssistantMessage([
      {
        type: "tool-addGuest",
        state: "output-error",
        input: { name: "Alice" },
        errorText: "Either email or phone is required.",
      },
    ]);

    const toolPart = message.parts[0];
    expect(isToolPartError(toolPart)).toBe(true);
    expect(getToolOutputMessage(toolPart)).toBe("Either email or phone is required.");
  });

  it("extracts messages from dynamic-tool output", () => {
    const message = buildAssistantMessage([
      {
        type: "dynamic-tool",
        toolName: "addGuest",
        toolCallId: "tool-1",
        state: "output-available",
        input: { name: "Alice" },
        output: { message: "Added Alice to the guest list." },
      },
    ]);

    expect(getToolOutputMessage(message.parts[0])).toBe("Added Alice to the guest list.");
  });
});
