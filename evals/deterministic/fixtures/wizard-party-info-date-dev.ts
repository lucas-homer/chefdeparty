export interface WizardPartyInfoDateEvalCase {
  name: string;
  nowIso: string;
  utterance: string;
  expected: {
    year: number;
    month: number; // 1-indexed
    day: number;
    weekday: number; // 0=Sunday ... 6=Saturday
    hour: number;
    minute: number;
  };
}

// Dev dataset: small, high-signal edge cases for relative date handling.
export const wizardPartyInfoDateDevCases: WizardPartyInfoDateEvalCase[] = [
  {
    name: "this weekend + saturday from monday",
    nowIso: "2026-02-16T09:00:00.000Z",
    utterance: "I'm having a party this weekend, on Saturday, at 7pm",
    expected: { year: 2026, month: 2, day: 21, weekday: 6, hour: 19, minute: 0 },
  },
  {
    name: "plain weekday reference",
    nowIso: "2026-02-16T09:00:00.000Z",
    utterance: "Saturday at 7pm",
    expected: { year: 2026, month: 2, day: 21, weekday: 6, hour: 19, minute: 0 },
  },
  {
    name: "next saturday explicitly",
    nowIso: "2026-02-16T09:00:00.000Z",
    utterance: "next Saturday at 7pm",
    expected: { year: 2026, month: 2, day: 28, weekday: 6, hour: 19, minute: 0 },
  },
  {
    name: "tonight defaults to 7pm if no time",
    nowIso: "2026-02-16T11:00:00.000Z",
    utterance: "tonight",
    expected: { year: 2026, month: 2, day: 16, weekday: 1, hour: 19, minute: 0 },
  },
  {
    name: "tomorrow with explicit time",
    nowIso: "2026-02-16T11:00:00.000Z",
    utterance: "tomorrow at 6:30pm",
    expected: { year: 2026, month: 2, day: 17, weekday: 2, hour: 18, minute: 30 },
  },
  {
    name: "month day rolls into next year when needed",
    nowIso: "2026-11-20T12:00:00.000Z",
    utterance: "March 15 at 6pm",
    expected: { year: 2027, month: 3, day: 15, weekday: 1, hour: 18, minute: 0 },
  },
  {
    name: "already-explicit iso datetime",
    nowIso: "2026-02-16T09:00:00.000Z",
    utterance: "2026-02-21T19:00:00",
    expected: { year: 2026, month: 2, day: 21, weekday: 6, hour: 19, minute: 0 },
  },
];
