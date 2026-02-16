import { createScorer, evalite } from "evalite";
import { parsePartyDateTimeInput } from "../../src/lib/party-date-parser";
import {
  wizardPartyInfoDateDevCases,
  type WizardPartyInfoDateEvalCase,
} from "./fixtures/wizard-party-info-date-dev";

type TaskOutput = {
  parsed: {
    iso: string;
    year: number;
    month: number;
    day: number;
    weekday: number;
    hour: number;
    minute: number;
    formatted: string;
  } | null;
  nowIso: string;
};

function toParts(date: Date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    weekday: date.getDay(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

evalite("Wizard Party Info - Relative Date Resolution (Dev)", {
  data: async () =>
    wizardPartyInfoDateDevCases.map((testCase) => ({
      input: testCase,
      expected: testCase.expected,
    })),

  task: async (input: WizardPartyInfoDateEvalCase): Promise<TaskOutput> => {
    const now = new Date(input.nowIso);
    const parsed = parsePartyDateTimeInput(input.utterance, now);

    if (!parsed) {
      return { parsed: null, nowIso: input.nowIso };
    }

    const parts = toParts(parsed);
    return {
      parsed: {
        iso: parsed.toISOString(),
        ...parts,
        formatted: parsed.toLocaleString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
      },
      nowIso: input.nowIso,
    };
  },

  scorers: [
    createScorer({
      name: "Successfully parses date intent",
      scorer: async ({ output }) => (output.parsed ? 1 : 0),
    }),
    createScorer({
      name: "Matches expected calendar date",
      scorer: async ({ input, output }) => {
        if (!output.parsed) return 0;
        const { expected } = input;
        return output.parsed.year === expected.year
          && output.parsed.month === expected.month
          && output.parsed.day === expected.day
          && output.parsed.weekday === expected.weekday
          ? 1
          : 0;
      },
    }),
    createScorer({
      name: "Matches expected time",
      scorer: async ({ input, output }) => {
        if (!output.parsed) return 0;
        const { expected } = input;
        return output.parsed.hour === expected.hour
          && output.parsed.minute === expected.minute
          ? 1
          : 0;
      },
    }),
    createScorer({
      name: "Resolved date is not in the past",
      scorer: async ({ output }) => {
        if (!output.parsed) return 0;
        const now = new Date(output.nowIso);
        const resolved = new Date(output.parsed.iso);
        return resolved.getTime() >= now.getTime() ? 1 : 0;
      },
    }),
  ],
});
