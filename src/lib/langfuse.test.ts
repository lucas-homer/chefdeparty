import { describe, expect, it, vi } from "vitest";
import {
  sanitizeLangfusePayload,
  updateLangfuseGeneration,
  updateLangfuseTrace,
} from "./langfuse";

describe("langfuse helpers", () => {
  describe("sanitizeLangfusePayload", () => {
    it("replaces image data URLs and truncates very long strings", () => {
      const payload = {
        input: {
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  image: `data:image/png;base64,${"a".repeat(120)}`,
                },
                {
                  type: "text",
                  text: "x".repeat(9000),
                },
              ],
            },
          ],
        },
      };

      const sanitized = sanitizeLangfusePayload(payload) as {
        input: {
          messages: Array<{
            content: Array<{ image?: string; text?: string }>;
          }>;
        };
      };

      expect(sanitized.input.messages[0].content[0].image).toContain("[omitted image data");
      expect(sanitized.input.messages[0].content[1].text?.length).toBeLessThan(5000);
      expect(sanitized.input.messages[0].content[1].text).toContain("[truncated");
    });
  });

  describe("updateLangfuseGeneration", () => {
    it("sends sanitized payloads to Langfuse updates", () => {
      const update = vi.fn();
      const generation = {
        id: "gen_123",
        update,
        end: vi.fn(),
      };

      updateLangfuseGeneration(generation, {
        output: {
          image: `data:image/jpeg;base64,${"b".repeat(120)}`,
        },
      });

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0]).toMatchObject({
        output: {
          image: expect.stringContaining("[omitted image data"),
        },
      });
    });
  });

  describe("updateLangfuseTrace", () => {
    it("sends sanitized payloads to trace updates", () => {
      const update = vi.fn();
      const trace = {
        id: "trace_123",
        update,
      };

      updateLangfuseTrace(trace, {
        output: {
          image: `data:image/png;base64,${"z".repeat(120)}`,
        },
      });

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0]).toMatchObject({
        output: {
          image: expect.stringContaining("[omitted image data"),
        },
      });
    });
  });
});
