/**
 * Party Info Agent Eval
 *
 * Tests the model fallback path for the party-info wizard step.
 * When the deterministic resolver falls through (low-confidence), the model
 * must call updatePartyInfo with whatever partial data it can extract,
 * then ask for missing fields.
 *
 * These evals run against the real LLM (Gemini 2.5 Flash) with mock tool
 * implementations to verify tool-calling behavior.
 */
import "./setup-env";
import { writeFileSync } from "node:fs";
import { evalite, createScorer } from "evalite";
import { generateText, tool } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { getStepSystemPrompt } from "../src/lib/party-wizard-prompts";

const hasGoogleApiKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PartyInfoAgentEvalInput {
  name: string;
  userMessage: string;
  referenceNowIso: string;
  existingPartyInfo: Record<string, unknown> | null;
  expected: {
    callsUpdatePartyInfo: boolean;
    /** If true, the updatePartyInfo call should include a name */
    hasName?: boolean;
    /** If true, the updatePartyInfo call should include dateTimeInput */
    hasDateTimeInput?: boolean;
    /** If true, the updatePartyInfo call should include location */
    hasLocation?: boolean;
    /** If true, confirmPartyInfo should also be called */
    callsConfirmPartyInfo?: boolean;
    /** Expected name value (loose match) */
    expectedNameContains?: string;
  };
}

interface PartyInfoAgentEvalOutput {
  toolCalls: Array<{ toolName: string }>;
  updatePartyInfoArgs: Record<string, unknown> | null;
  calledConfirmPartyInfo: boolean;
  text: string;
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

const partyInfoAgentCases: Array<{
  input: PartyInfoAgentEvalInput;
  expected: PartyInfoAgentEvalInput["expected"];
}> = [
  {
    input: {
      name: "full context without explicit name → partial save + ask for name",
      userMessage:
        "I'm having a party for Sunday, April 5th at 1pm. It'll be at Cara's House",
      referenceNowIso: "2026-03-07T00:04:20.000Z",
      existingPartyInfo: null,
      expected: {
        callsUpdatePartyInfo: true,
        hasDateTimeInput: true,
        hasLocation: true,
        hasName: false,
        callsConfirmPartyInfo: false,
      },
    },
    expected: {
      callsUpdatePartyInfo: true,
      hasDateTimeInput: true,
      hasLocation: true,
      hasName: false,
      callsConfirmPartyInfo: false,
    },
  },
  {
    input: {
      name: "all required info present → save all fields",
      userMessage:
        "I'm throwing an Oscars Watch Party this Sunday at 7pm at our apartment",
      referenceNowIso: "2026-03-04T12:00:00.000Z",
      existingPartyInfo: null,
      expected: {
        callsUpdatePartyInfo: true,
        hasName: true,
        hasDateTimeInput: true,
        hasLocation: true,
        // Note: confirmPartyInfo is NOT expected here. When updatePartyInfo
        // sets all required fields, the server auto-triggers confirmation.
        // Gemini 2.5 Flash doesn't reliably chain tool calls.
        callsConfirmPartyInfo: false,
        expectedNameContains: "Oscars",
      },
    },
    expected: {
      callsUpdatePartyInfo: true,
      hasName: true,
      hasDateTimeInput: true,
      hasLocation: true,
      callsConfirmPartyInfo: false,
      expectedNameContains: "Oscars",
    },
  },
  {
    input: {
      name: "only name provided → partial save + ask for date",
      userMessage: "Let's plan a birthday party for Sarah",
      referenceNowIso: "2026-03-06T12:00:00.000Z",
      existingPartyInfo: null,
      expected: {
        callsUpdatePartyInfo: true,
        hasName: true,
        hasDateTimeInput: false,
        callsConfirmPartyInfo: false,
        expectedNameContains: "Sarah",
      },
    },
    expected: {
      callsUpdatePartyInfo: true,
      hasName: true,
      hasDateTimeInput: false,
      callsConfirmPartyInfo: false,
      expectedNameContains: "Sarah",
    },
  },
  {
    input: {
      name: "date and time only → partial save + ask for name",
      userMessage: "I'm having a dinner party next Friday at 7pm",
      referenceNowIso: "2026-03-04T12:00:00.000Z",
      existingPartyInfo: null,
      expected: {
        callsUpdatePartyInfo: true,
        hasDateTimeInput: true,
        hasName: false,
        callsConfirmPartyInfo: false,
      },
    },
    expected: {
      callsUpdatePartyInfo: true,
      hasDateTimeInput: true,
      hasName: false,
      callsConfirmPartyInfo: false,
    },
  },
  {
    input: {
      name: "multi-turn: name completes partial → save name",
      userMessage: "Let's call it Easter Sunday Brunch",
      referenceNowIso: "2026-03-07T00:10:00.000Z",
      existingPartyInfo: {
        name: "",
        dateTime: "2026-04-05T13:00:00.000Z",
        location: "Cara's House",
      },
      expected: {
        callsUpdatePartyInfo: true,
        hasName: true,
        // Server auto-triggers confirmation when all required fields are set
        callsConfirmPartyInfo: false,
        expectedNameContains: "Easter",
      },
    },
    expected: {
      callsUpdatePartyInfo: true,
      hasName: true,
      callsConfirmPartyInfo: false,
      expectedNameContains: "Easter",
    },
  },
  {
    input: {
      name: "vague planning intent → still tries to extract what it can",
      userMessage: "I want to plan a St. Patty's Day party at the pub",
      referenceNowIso: "2026-03-06T12:00:00.000Z",
      existingPartyInfo: null,
      expected: {
        callsUpdatePartyInfo: true,
        hasName: true,
        hasLocation: true,
        expectedNameContains: "Patty",
      },
    },
    expected: {
      callsUpdatePartyInfo: true,
      hasName: true,
      hasLocation: true,
      expectedNameContains: "Patty",
    },
  },
];

// ---------------------------------------------------------------------------
// Tool definitions (mock implementations)
// ---------------------------------------------------------------------------

const updatePartyInfoParams = z.object({
  name: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Name of the party or event (e.g., 'Sarah's Birthday', 'Summer BBQ')"
    ),
  dateTimeInput: z
    .string()
    .optional()
    .describe(
      "The user's natural-language date/time phrase (e.g., 'this weekend on Saturday at 7pm', 'March 15 at 6pm'). Do NOT convert to ISO."
    ),
  location: z
    .string()
    .optional()
    .describe(
      "Where the party will be held (e.g., '123 Main St' or 'My place')"
    ),
  description: z
    .string()
    .optional()
    .describe("Optional description or details for the invitation"),
  allowContributions: z
    .boolean()
    .optional()
    .describe("Whether guests can sign up to bring dishes or drinks"),
});

/**
 * Create mock tools with capture callbacks.
 * Args are captured via execute() since result.steps doesn't reliably
 * expose them across all AI SDK providers.
 *
 * The updatePartyInfo result merges new args with existing data and reports
 * which required fields are set, mirroring the real handler. This gives the
 * model enough context to decide whether to call confirmPartyInfo.
 */
function createMockTools(
  existingPartyInfo: Record<string, unknown> | null,
  capture: {
    onUpdatePartyInfo: (args: Record<string, unknown>) => void;
    onConfirmPartyInfo: () => void;
  }
) {
  // Track accumulated state across multiple updatePartyInfo calls
  const currentState: Record<string, unknown> = existingPartyInfo
    ? { ...existingPartyInfo }
    : {};

  return {
    updatePartyInfo: tool({
      description:
        "Update the party details. Call this whenever the user provides or changes party information (name, date/time, location, etc.). Each field is optional — only include fields that are being set or changed.",
      parameters: updatePartyInfoParams,
      execute: async (args) => {
        capture.onUpdatePartyInfo(args as Record<string, unknown>);

        // Merge new args into current state
        if (args.name) currentState.name = args.name;
        if (args.dateTimeInput) currentState.dateTimeInput = args.dateTimeInput;
        if (args.location) currentState.location = args.location;

        const hasName = Boolean(currentState.name);
        const hasDateTime = Boolean(
          currentState.dateTimeInput || currentState.dateTime
        );
        const allRequiredSet = hasName && hasDateTime;

        return {
          success: true,
          action: "updatePartyInfo",
          partyInfo: currentState,
          fieldsSet: { name: hasName, dateTime: hasDateTime },
          allRequiredFieldsSet: allRequiredSet,
          message: allRequiredSet
            ? "All required fields are set. Call confirmPartyInfo to show the confirmation dialog."
            : `Updated party details. Still missing: ${[!hasName && "name", !hasDateTime && "date/time"].filter(Boolean).join(", ")}.`,
        };
      },
    }),
    confirmPartyInfo: tool({
      description:
        "Show the party details confirmation dialog to the user. Call this AFTER updatePartyInfo when all required fields (name + date/time) are set. Reads from the current session state — no arguments needed.",
      parameters: z.object({}),
      execute: async () => {
        capture.onConfirmPartyInfo();
        return {
          success: true,
          action: "awaitingConfirmation",
          message: "Please confirm the party details above.",
        };
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Build system prompt (same as handler)
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  referenceNowIso: string,
  existingPartyInfo: Record<string, unknown> | null
): string {
  let prompt = getStepSystemPrompt("party-info", {
    partyInfo: existingPartyInfo as never,
    guestList: [],
    menuPlan: undefined,
    userRecipes: [],
  });

  prompt += `

<date-resolution-context>
Reference current datetime (ISO, UTC): ${referenceNowIso}
When calling updatePartyInfo:
- Pass the user's natural date text in dateTimeInput (do NOT convert to ISO yourself).
- The server will resolve dateTimeInput using the reference datetime above.
</date-resolution-context>`;

  return prompt;
}

// ---------------------------------------------------------------------------
// Scoring helpers (used by both evalite scorers and JSON report)
// ---------------------------------------------------------------------------

function scoreCase(
  output: PartyInfoAgentEvalOutput,
  expected: PartyInfoAgentEvalInput["expected"]
): Record<string, number> {
  const scores: Record<string, number> = {};

  // Calls updatePartyInfo
  const calledUpdate = output.toolCalls.some(
    (tc) => tc.toolName === "updatePartyInfo"
  );
  scores["callsUpdatePartyInfo"] =
    !expected.callsUpdatePartyInfo ? 1 : calledUpdate ? 1 : 0;

  // Has expected fields
  if (output.updatePartyInfoArgs && expected) {
    const args = output.updatePartyInfoArgs;
    let checks = 0;
    let passed = 0;

    if (expected.hasName !== undefined) {
      checks++;
      if ((!!args.name && String(args.name).length > 0) === expected.hasName) passed++;
    }
    if (expected.hasDateTimeInput !== undefined) {
      checks++;
      if (!!args.dateTimeInput === expected.hasDateTimeInput) passed++;
    }
    if (expected.hasLocation !== undefined) {
      checks++;
      if (!!args.location === expected.hasLocation) passed++;
    }
    scores["hasExpectedFields"] = checks > 0 ? passed / checks : 1;
  } else {
    scores["hasExpectedFields"] = 0;
  }

  // Name quality
  if (expected.expectedNameContains) {
    const name = output.updatePartyInfoArgs?.name
      ? String(output.updatePartyInfoArgs.name).toLowerCase()
      : "";
    scores["nameQuality"] = name.includes(expected.expectedNameContains.toLowerCase()) ? 1 : 0;
  } else {
    scores["nameQuality"] = 1;
  }

  // Calls confirmPartyInfo
  if (expected.callsConfirmPartyInfo !== undefined) {
    scores["callsConfirmPartyInfo"] =
      output.calledConfirmPartyInfo === expected.callsConfirmPartyInfo ? 1 : 0;
  } else {
    scores["callsConfirmPartyInfo"] = 1;
  }

  // Includes text
  scores["includesText"] = output.text.trim().length > 0 ? 1 : 0;

  return scores;
}

// ---------------------------------------------------------------------------
// Evalite scorers (wrap the shared scoring logic)
// ---------------------------------------------------------------------------

const callsUpdatePartyInfoScorer = createScorer<
  PartyInfoAgentEvalInput,
  PartyInfoAgentEvalOutput
>({
  name: "Calls updatePartyInfo",
  description: "The model should always call updatePartyInfo to persist partial data.",
  scorer: async ({ output, expected }) => scoreCase(output, expected!).callsUpdatePartyInfo,
});

const hasExpectedFieldsScorer = createScorer<
  PartyInfoAgentEvalInput,
  PartyInfoAgentEvalOutput
>({
  name: "Has expected fields in updatePartyInfo",
  description: "updatePartyInfo should include/omit fields matching expectations.",
  scorer: async ({ output, expected }) => scoreCase(output, expected!).hasExpectedFields,
});

const nameQualityScorer = createScorer<
  PartyInfoAgentEvalInput,
  PartyInfoAgentEvalOutput
>({
  name: "Name quality",
  description: "When a name is expected, check it contains the key term.",
  scorer: async ({ output, expected }) => scoreCase(output, expected!).nameQuality,
});

const callsConfirmScorer = createScorer<
  PartyInfoAgentEvalInput,
  PartyInfoAgentEvalOutput
>({
  name: "Calls confirmPartyInfo correctly",
  description: "confirmPartyInfo should be called only when all required info is present.",
  scorer: async ({ output, expected }) => scoreCase(output, expected!).callsConfirmPartyInfo,
});

const includesTextScorer = createScorer<
  PartyInfoAgentEvalInput,
  PartyInfoAgentEvalOutput
>({
  name: "Includes conversational text",
  description:
    "The model should respond with text alongside tool calls. " +
    "Known Gemini limitation: Flash sometimes returns tool calls without text. " +
    "The handler adds a default message as fallback, so this is non-critical.",
  scorer: async ({ output }) => scoreCase(output, {} as never).includesText,
});

// ---------------------------------------------------------------------------
// JSON results collector — writes eval-results.json after all cases complete
// ---------------------------------------------------------------------------

const collectedResults: Array<{
  case: string;
  input: string;
  expected: PartyInfoAgentEvalInput["expected"];
  output: PartyInfoAgentEvalOutput;
  scores: Record<string, number>;
}> = [];

let resultsWritten = false;

function collectResult(
  input: PartyInfoAgentEvalInput,
  output: PartyInfoAgentEvalOutput,
  expected: PartyInfoAgentEvalInput["expected"]
) {
  const scores = scoreCase(output, expected);
  collectedResults.push({
    case: input.name,
    input: input.userMessage,
    expected,
    output,
    scores,
  });

  // Write results file when all cases have been collected
  if (collectedResults.length === partyInfoAgentCases.length && !resultsWritten) {
    resultsWritten = true;
    const avgScores: Record<string, number> = {};
    for (const key of Object.keys(collectedResults[0].scores)) {
      const vals = collectedResults.map((r) => r.scores[key]);
      avgScores[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    const report = {
      eval: "Party Info - Agent Tool Use (Gemini 2.5 Flash)",
      timestamp: new Date().toISOString(),
      averageScores: avgScores,
      cases: collectedResults,
    };
    writeFileSync("eval-results.json", JSON.stringify(report, null, 2));
    console.log("\n📄 Detailed results written to eval-results.json");
  }
}

// ---------------------------------------------------------------------------
// Eval definition
// ---------------------------------------------------------------------------

if (!hasGoogleApiKey) {
  evalite(
    "Party Info Agent (skipped: missing GOOGLE_GENERATIVE_AI_API_KEY)",
    {
      data: async () => [
        { input: "missing-api-key" as never, expected: "missing-api-key" as never },
      ],
      task: async () => "missing-api-key" as never,
      scorers: [
        createScorer({ name: "Skipped", scorer: async () => 1 }),
      ],
    }
  );
} else {
  evalite("Party Info - Agent Tool Use (Gemini 2.5 Flash)", {
    data: async () => partyInfoAgentCases,

    task: async (
      input: PartyInfoAgentEvalInput
    ): Promise<PartyInfoAgentEvalOutput> => {
      const systemPrompt = buildSystemPrompt(
        input.referenceNowIso,
        input.existingPartyInfo
      );

      // Capture tool args via execute callbacks (more reliable than
      // extracting from result.steps which varies across providers).
      let capturedUpdateArgs: Record<string, unknown> | null = null;
      let capturedCalledConfirm = false;

      const tools = createMockTools(input.existingPartyInfo, {
        onUpdatePartyInfo: (args) => {
          capturedUpdateArgs = args;
        },
        onConfirmPartyInfo: () => {
          capturedCalledConfirm = true;
        },
      });

      // Build message history — if existingPartyInfo has data, prepend
      // a synthetic assistant message summarising what's already known
      // so the model has context for multi-turn scenarios.
      const messages: Array<{ role: "user" | "assistant"; content: string }> =
        [];

      if (input.existingPartyInfo) {
        const parts: string[] = [];
        if (input.existingPartyInfo.name) {
          parts.push(`name: ${input.existingPartyInfo.name}`);
        }
        if (input.existingPartyInfo.dateTime) {
          const dt = new Date(input.existingPartyInfo.dateTime as string);
          parts.push(`date: ${dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`);
        }
        if (input.existingPartyInfo.location) {
          parts.push(`location: ${input.existingPartyInfo.location}`);
        }
        if (parts.length > 0) {
          // Gemini requires conversations to start with a user message.
          // Simulate the prior turn that created the existing state.
          messages.push({
            role: "user",
            content: "I want to plan a party",
          });
          messages.push({
            role: "assistant",
            content: `So far I have: ${parts.join(", ")}. What else can you tell me?`,
          });
        }
      }

      messages.push({ role: "user", content: input.userMessage });

      const result = await generateText({
        model: google("gemini-2.5-flash"),
        system: systemPrompt,
        messages,
        tools,
        maxSteps: 5,
      });

      // Extract tool names and text from ALL steps.
      // result.text only includes text from the final step, but the model
      // may produce text alongside tool calls in earlier steps.
      const toolNames: string[] = [];
      const textParts: string[] = [];
      for (const step of result.steps) {
        for (const tc of step.toolCalls) {
          toolNames.push(tc.toolName);
        }
        if (step.text) {
          textParts.push(step.text);
        }
      }

      const output: PartyInfoAgentEvalOutput = {
        toolCalls: toolNames.map((name) => ({ toolName: name })),
        updatePartyInfoArgs: capturedUpdateArgs,
        calledConfirmPartyInfo: capturedCalledConfirm,
        text: textParts.join("") || result.text,
      };

      // Collect for JSON report
      collectResult(input, output, input.expected);

      return output;
    },

    scorers: [
      callsUpdatePartyInfoScorer,
      hasExpectedFieldsScorer,
      nameQualityScorer,
      callsConfirmScorer,
      includesTextScorer,
    ],
  });
}
