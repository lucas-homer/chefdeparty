import type { UIMessage } from "ai";
import { summarizeWizardMessage } from "./wizard-message-debug";

function buildMessage(parts: UIMessage["parts"]): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    parts,
    metadata: undefined,
  };
}

describe("summarizeWizardMessage", () => {
  it("marks assistant text content as visible", () => {
    const message = buildMessage([{ type: "text", text: "Added 2 guests." }]);

    const summary = summarizeWizardMessage(message);

    expect(summary.hasVisibleContent).toBe(true);
    expect(summary.visiblePartTypes).toEqual(["text"]);
  });

  it("flags tool-only assistant messages as hidden but captures tool output message", () => {
    const message = buildMessage([
      {
        type: "tool-addGuest",
        state: "output-available",
        input: { name: "A", email: "a@test.com" },
        output: { success: true, message: "Added A to guest list." },
      },
    ]);

    const summary = summarizeWizardMessage(message);

    expect(summary.hasVisibleContent).toBe(true);
    expect(summary.visiblePartTypes).toEqual(["tool-addGuest"]);
    expect(summary.partTypes).toEqual(["tool-addGuest"]);
    expect(summary.toolOutputMessages).toEqual(["Added A to guest list."]);
  });

  it("treats a confirmation request as visible", () => {
    const message = buildMessage([
      {
        type: "data-step-confirmation-request",
        data: {
          request: {
            id: "req-1",
            step: "guests",
            nextStep: "menu",
            summary: "2 guests",
            data: { guestList: [] },
          },
        },
      },
    ]);

    const summary = summarizeWizardMessage(message);

    expect(summary.hasVisibleContent).toBe(true);
    expect(summary.visiblePartTypes).toEqual(["data-step-confirmation-request"]);
  });
});
