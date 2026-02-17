import type { SerializedUIMessage } from "../../../drizzle/schema";
import { filterMessagesForAI, stripLargeDataForStorage } from "./utils";

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
  });
});
