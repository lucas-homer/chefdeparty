import type { UIMessage } from "ai";
import {
  getToolOutputMessage,
  hasNonEmptyTextPart,
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
});
