import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRecordingAdapter } from "./telemetry-port";
import type { TelemetryPort } from "./telemetry-port";

// Mock the AI SDK
vi.mock("ai", () => {
  return {
    streamText: vi.fn(),
    generateObject: vi.fn(),
    stepCountIs: vi.fn().mockReturnValue("stepCountIs-sentinel"),
    hasToolCall: vi.fn().mockReturnValue("hasToolCall-sentinel"),
  };
});

function createMockStreamTextResult(overrides: {
  text?: string;
  finishReason?: string;
  toolCalls?: unknown[];
  toolResults?: unknown[];
  usage?: { outputTokens?: number };
} = {}) {
  const text = overrides.text ?? "Hello!";
  const finishReason = overrides.finishReason ?? "stop";
  const usage = overrides.usage ?? { outputTokens: 42 };
  const toolCalls = overrides.toolCalls ?? [];
  const toolResults = overrides.toolResults ?? [];

  return {
    toUIMessageStream: vi.fn().mockReturnValue("mock-stream"),
    response: Promise.resolve({ messages: [{ role: "assistant", content: text }] }),
    text: Promise.resolve(text),
    finishReason: Promise.resolve(finishReason),
    rawFinishReason: Promise.resolve(finishReason),
    usage: Promise.resolve(usage),
    toolCalls: Promise.resolve(toolCalls),
    toolResults: Promise.resolve(toolResults),
  };
}

function createMockWriter() {
  return {
    merge: vi.fn(),
    write: vi.fn(),
  };
}

describe("wizard-ai-runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("runWithRetry", () => {
    it("returns result without retry when first attempt succeeds", async () => {
      const { streamText } = await import("ai");
      const mockResult = createMockStreamTextResult({ text: "Great party!" });
      (streamText as ReturnType<typeof vi.fn>).mockReturnValue(mockResult);

      const telemetry = createRecordingAdapter();
      const writer = createMockWriter();

      const { runWithRetry } = await import("./wizard-ai-runner");
      const { result, retryAttempted, attempts } = await runWithRetry(
        {
          telemetry,
          functionIdPrefix: "wizard.timeline",
        },
        {
          model: {} as never,
          modelName: "gemini-2.5-flash",
          systemPrompt: "You are a helper",
          messages: [],
          tools: {},
          confirmationToolName: "confirmTimeline",
          writer: writer as never,
          strongModel: {} as never,
          strongModelName: "gemini-2.5-pro",
        }
      );

      expect(retryAttempted).toBe(false);
      expect(result.responseText).toBe("Great party!");
      expect(result.isSilentCompletion).toBe(false);
      expect(attempts).toHaveLength(1);

      // Writer should have merged the stream
      expect(writer.merge).toHaveBeenCalledWith("mock-stream");

      // Telemetry should show one generation lifecycle
      const genEvents = telemetry.events.filter(
        (e) => e.type === "generation-start" || e.type === "generation-update" || e.type === "generation-end"
      );
      expect(genEvents).toHaveLength(3);
      expect(genEvents[0].type).toBe("generation-start");
      expect(genEvents[1].type).toBe("generation-update");
      expect(genEvents[2].type).toBe("generation-end");
    });

    it("retries with strong model when first attempt is silent", async () => {
      const { streamText } = await import("ai");
      const silentResult = createMockStreamTextResult({
        text: "",
        finishReason: "stop",
        usage: { outputTokens: 0 },
        toolCalls: [],
      });
      const successResult = createMockStreamTextResult({ text: "Here's your timeline!" });
      (streamText as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(silentResult)
        .mockReturnValueOnce(successResult);

      const telemetry = createRecordingAdapter();
      const writer = createMockWriter();
      const strongModel = { id: "strong" };

      const { runWithRetry } = await import("./wizard-ai-runner");
      const { result, retryAttempted, retrySucceeded, attempts } = await runWithRetry(
        { telemetry, functionIdPrefix: "wizard.timeline" },
        {
          model: {} as never,
          modelName: "gemini-2.5-flash",
          systemPrompt: "You are a helper",
          messages: [],
          tools: {},
          confirmationToolName: "confirmTimeline",
          writer: writer as never,
          strongModel: strongModel as never,
          strongModelName: "gemini-2.5-pro",
        }
      );

      expect(retryAttempted).toBe(true);
      expect(retrySucceeded).toBe(true);
      expect(result.responseText).toBe("Here's your timeline!");
      expect(result.modelTier).toBe("strong");
      expect(attempts).toHaveLength(2);
      expect(attempts[0].isSilentCompletion).toBe(true);
      expect(attempts[1].isSilentCompletion).toBe(false);

      // Strong model should have been passed to second streamText call
      expect(streamText).toHaveBeenCalledTimes(2);
      expect((streamText as ReturnType<typeof vi.fn>).mock.calls[1][0].model).toBe(strongModel);

      // Telemetry should show two generation lifecycles
      const genStarts = telemetry.events.filter((e) => e.type === "generation-start");
      expect(genStarts).toHaveLength(2);
    });

    it("returns silent result when both attempts are silent", async () => {
      const { streamText } = await import("ai");
      const silentResult = () => createMockStreamTextResult({
        text: "",
        finishReason: "stop",
        usage: { outputTokens: 0 },
        toolCalls: [],
      });
      (streamText as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(silentResult())
        .mockReturnValueOnce(silentResult());

      const telemetry = createRecordingAdapter();
      const writer = createMockWriter();

      const { runWithRetry } = await import("./wizard-ai-runner");
      const { result, retryAttempted, retrySucceeded } = await runWithRetry(
        { telemetry, functionIdPrefix: "wizard.timeline" },
        {
          model: {} as never,
          modelName: "gemini-2.5-flash",
          systemPrompt: "You are a helper",
          messages: [],
          tools: {},
          confirmationToolName: "confirmTimeline",
          writer: writer as never,
          strongModel: {} as never,
          strongModelName: "gemini-2.5-pro",
        }
      );

      expect(retryAttempted).toBe(true);
      expect(retrySucceeded).toBe(false);
      expect(result.isSilentCompletion).toBe(true);
    });
  });

  describe("tracedGenerateObject", () => {
    it("wraps generateObject with generation lifecycle", async () => {
      const { generateObject } = await import("ai");
      (generateObject as ReturnType<typeof vi.fn>).mockResolvedValue({
        object: { name: "Pasta Carbonara", ingredients: [] },
        usage: { outputTokens: 55 },
      });

      const telemetry = createRecordingAdapter();

      const { tracedGenerateObject } = await import("./wizard-ai-runner");
      const result = await tracedGenerateObject(
        { telemetry, functionIdPrefix: "wizard.menu" },
        {
          generationName: "wizard.menu.extractRecipe",
          modelName: "gemini-2.5-flash",
          model: {} as never,
          schema: {} as never,
          prompt: "Extract the recipe",
          metadata: { sourceUrl: "https://example.com" },
        }
      );

      expect(result.object).toEqual({ name: "Pasta Carbonara", ingredients: [] });

      // Should have start → update → end
      expect(telemetry.events).toEqual([
        expect.objectContaining({
          type: "generation-start",
          params: expect.objectContaining({
            name: "wizard.menu.extractRecipe",
            model: "gemini-2.5-flash",
          }),
        }),
        expect.objectContaining({
          type: "generation-update",
          name: "wizard.menu.extractRecipe",
          payload: expect.objectContaining({
            output: { name: "Pasta Carbonara", ingredients: [] },
          }),
        }),
        expect.objectContaining({
          type: "generation-end",
          name: "wizard.menu.extractRecipe",
        }),
      ]);
    });

    it("ends generation even when generateObject throws", async () => {
      const { generateObject } = await import("ai");
      (generateObject as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("AI extraction failed")
      );

      const telemetry = createRecordingAdapter();

      const { tracedGenerateObject } = await import("./wizard-ai-runner");
      await expect(
        tracedGenerateObject(
          { telemetry, functionIdPrefix: "wizard.menu" },
          {
            generationName: "wizard.menu.extractRecipe",
            modelName: "gemini-2.5-flash",
            model: {} as never,
            schema: {} as never,
            prompt: "Extract the recipe",
          }
        )
      ).rejects.toThrow("AI extraction failed");

      // Generation should still be ended (no dangling spans)
      const endEvents = telemetry.events.filter((e) => e.type === "generation-end");
      expect(endEvents).toHaveLength(1);
    });
  });
});
