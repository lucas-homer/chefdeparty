import type { SerializedUIMessage } from "../../../drizzle/schema";
import {
  buildTelemetrySettings,
  filterMessagesForAI,
  getSilentCompletionFallbackMessage,
  isSilentModelCompletion,
  stripLargeDataForStorage,
} from "./utils";

function buildMessage(
  role: "user" | "assistant",
  parts: Array<Record<string, unknown>>
): SerializedUIMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content: "",
    parts,
    createdAt: new Date().toISOString(),
  };
}

describe("party-wizard handler utils", () => {
  describe("stripLargeDataForStorage", () => {
    it("replaces image payloads with imageStripped placeholders", () => {
      const parts = stripLargeDataForStorage([
        {
          type: "image",
          image: "data:image/png;base64,abc123",
        },
      ]);

      expect(parts).toEqual([
        {
          type: "image",
          imageStripped: true,
          mimeType: "image/png",
        },
      ]);
    });
  });

  describe("filterMessagesForAI", () => {
    it("removes stripped image placeholders but keeps accompanying text", () => {
      const messages = [
        buildMessage("user", [
          { type: "image", imageStripped: true, mimeType: "image/png" },
          { type: "text", text: "Please extract this recipe." },
        ]),
      ];

      const filtered = filterMessagesForAI(messages);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].parts).toEqual([{ type: "text", text: "Please extract this recipe." }]);
    });

    it("filters out messages that only contain stripped binary placeholders", () => {
      const messages = [
        buildMessage("user", [{ type: "image", imageStripped: true, mimeType: "image/jpeg" }]),
      ];

      const filtered = filterMessagesForAI(messages);
      expect(filtered).toHaveLength(0);
    });

    it("keeps real image parts for current valid multimodal requests", () => {
      const messages = [
        buildMessage("user", [
          { type: "image", image: "data:image/jpeg;base64,real-data" },
          { type: "text", text: "What dish is this?" },
        ]),
      ];

      const filtered = filterMessagesForAI(messages);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].parts).toEqual([
        { type: "image", image: "data:image/jpeg;base64,real-data" },
        { type: "text", text: "What dish is this?" },
      ]);
    });

    it("removes legacy dynamic-tool parts that are invalid model input", () => {
      const messages = [
        buildMessage("assistant", [
          { type: "text", text: "Added Chelsea and Bam to the guest list." },
          {
            type: "dynamic-tool",
            state: "output-available",
            output: { action: "updateGuestList" },
          },
        ]),
      ];

      const filtered = filterMessagesForAI(messages);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].parts).toEqual([
        { type: "text", text: "Added Chelsea and Bam to the guest list." },
      ]);
    });
  });

  describe("buildTelemetrySettings", () => {
    it("enables input and output recording when telemetry context exists", () => {
      const settings = buildTelemetrySettings(
        {
          traceId: "trace_123",
          sessionId: "session_123",
          userId: "user_123",
          step: "menu",
          environment: "development",
        },
        "wizard.menu.streamText"
      );

      expect(settings).toMatchObject({
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: "wizard.menu.streamText",
      });
    });
  });

  describe("isSilentModelCompletion", () => {
    it("returns true when model ends with no text and no tool activity", () => {
      const isSilent = isSilentModelCompletion({
        finishReason: "other",
        responseText: "",
        toolCalls: [],
        toolResults: [],
      });

      expect(isSilent).toBe(true);
    });

    it("returns false when text is present", () => {
      const isSilent = isSilentModelCompletion({
        finishReason: "stop",
        responseText: "Anyone else to add?",
        toolCalls: [],
        toolResults: [],
      });

      expect(isSilent).toBe(false);
    });

    it("returns false when tool calls exist even without text", () => {
      const isSilent = isSilentModelCompletion({
        finishReason: "tool-calls",
        responseText: "",
        toolCalls: [{ type: "tool-call", toolName: "addGuest" }],
        toolResults: [],
      });

      expect(isSilent).toBe(false);
    });
  });

  describe("getSilentCompletionFallbackMessage", () => {
    it("returns content-filter specific guidance", () => {
      expect(getSilentCompletionFallbackMessage("content-filter")).toContain("filtered");
    });

    it("returns a generic retry message for provider interruptions", () => {
      expect(getSilentCompletionFallbackMessage("other")).toContain("temporary issue");
    });
  });
});
