import type { SerializedUIMessage } from "../../../drizzle/schema";
import {
  buildTelemetrySettings,
  filterMessagesForAI,
  getSilentCompletionFallbackMessage,
  hashImageData,
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

  describe("hashImageData", () => {
    it("returns a deterministic SHA-256 hex hash", async () => {
      const hash = await hashImageData("data:image/png;base64,abc123");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);

      // Same input produces same hash
      const hash2 = await hashImageData("data:image/png;base64,abc123");
      expect(hash2).toBe(hash);
    });

    it("returns different hashes for different inputs", async () => {
      const hash1 = await hashImageData("data:image/png;base64,image1");
      const hash2 = await hashImageData("data:image/png;base64,image2");
      expect(hash1).not.toBe(hash2);
    });

    it("supports combined hash for multi-image deduplication", async () => {
      const hash1 = await hashImageData("data:image/png;base64,page1");
      const hash2 = await hashImageData("data:image/png;base64,page2");

      // Combined hash from joining individual hashes
      const combinedHash = await hashImageData(`${hash1}:${hash2}`);
      expect(combinedHash).toMatch(/^[0-9a-f]{64}$/);

      // Combined hash differs from individual hashes
      expect(combinedHash).not.toBe(hash1);
      expect(combinedHash).not.toBe(hash2);

      // Same combination produces same combined hash
      const combinedHash2 = await hashImageData(`${hash1}:${hash2}`);
      expect(combinedHash2).toBe(combinedHash);
    });
  });
});
