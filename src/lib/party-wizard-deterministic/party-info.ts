import type { WizardState } from "../wizard-schemas";
import { parsePartyDateTimeInput } from "../party-date-parser";
import type {
  DeterministicHandledResult,
  DeterministicUnhandledResult,
  PartyInfoDeterministicIntent,
} from "./types";

interface PartyInfoDeterministicInput {
  text: string;
  currentData: Partial<WizardState>;
  referenceNow?: Date;
}

const DATE_SIGNAL_REGEX = /\b(today|tomorrow|tonight|weekend|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun|january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec|\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))\b/i;
const PARTY_SIGNAL_REGEX = /\b(party|birthday|bbq|celebration|dinner|event|gathering)\b/i;

function clean(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractQuotedName(text: string): string | undefined {
  const match = text.match(/\b(?:called|call(?:\s+(?:it|this))?|name(?:d)?|title)\s*["“]([^"”]{2,80})["”]/i);
  return clean(match?.[1]);
}

function extractUnquotedName(text: string): string | undefined {
  const match = text.match(/\b(?:called|call(?:\s+(?:it|this))?|name(?:d)?|title)\s+([^,.!?\n]{2,80})/i);
  if (!match?.[1]) return undefined;
  const candidate = match[1]
    .replace(/\s+(?:at|in|on|this|next)\b.*$/i, "")
    .trim();
  return clean(candidate);
}

function inferName(text: string): string | undefined {
  if (/\bbirthday\b/i.test(text)) return "Birthday Party";
  if (/\bbbq\b/i.test(text)) return "BBQ Party";
  if (/\bdinner\b/i.test(text)) return "Dinner Party";
  if (/\bparty\b/i.test(text)) return "Party";
  return undefined;
}

function extractLocation(text: string): string | undefined {
  const match = text.match(/\b(?:at|in)\s+([^,.!?\n]{2,80})/i);
  const candidate = clean(match?.[1]);
  if (!candidate) return undefined;

  if (/^\d{1,2}(?::\d{2})?\s*(am|pm)?$/i.test(candidate)) {
    return undefined;
  }

  return candidate;
}

function extractDescription(text: string): string | undefined {
  const match = text.match(/\b(?:description|details|occasion|it'?s for|this is for)\s*[:-]?\s*([^\n]{3,120})/i);
  return clean(match?.[1]);
}

function extractAllowContributions(text: string): boolean | undefined {
  if (/\b(no\s+potluck|no\s+contributions?|don'?t\s+bring|without\s+contributions?)\b/i.test(text)) {
    return false;
  }
  if (/\b(potluck|bring\s+(?:a\s+)?(?:dish|dishes|food)|contributions?\s+(?:are\s+)?(?:welcome|allowed))\b/i.test(text)) {
    return true;
  }
  return undefined;
}

export function resolveDeterministicPartyInfoTurn(
  input: PartyInfoDeterministicInput
): DeterministicHandledResult<PartyInfoDeterministicIntent> | DeterministicUnhandledResult {
  const text = input.text.trim();
  if (!text) {
    return { handled: false, reason: "no-signal" };
  }

  const existing = input.currentData.partyInfo || null;
  const explicitName = extractQuotedName(text) || extractUnquotedName(text);
  const inferredName = explicitName ? undefined : inferName(text);
  const name = explicitName || existing?.name || inferredName;

  const parsedDate = parsePartyDateTimeInput(text, input.referenceNow || new Date());
  const dateTime = parsedDate || (existing?.dateTime ? new Date(existing.dateTime) : undefined);

  const location = extractLocation(text) || existing?.location;
  const description = extractDescription(text) || existing?.description;
  const allowContributions = extractAllowContributions(text) ?? existing?.allowContributions ?? false;

  const hasDateSignal = DATE_SIGNAL_REGEX.test(text);
  const hasPartySignal = PARTY_SIGNAL_REGEX.test(text);

  if (name && dateTime) {
    return {
      handled: true,
      intent: "confirm-party-info",
      assistantText: "Perfect! Let me confirm those party details.",
      actions: [
        {
          type: "confirm-party-info",
          payload: {
            name,
            resolvedDateTime: dateTime,
            location,
            description,
            allowContributions,
          },
        },
      ],
    };
  }

  if (name && !dateTime) {
    if (hasDateSignal) {
      return {
        handled: true,
        intent: "ask-unparseable-datetime",
        assistantText: "I couldn't quite parse the date/time. Can you share it like \"Saturday at 7pm\" or \"March 15 at 6pm\"?",
        actions: [],
      };
    }

    return {
      handled: true,
      intent: "ask-missing-datetime",
      assistantText: `Great name. When is "${name}" happening?`,
      actions: [],
    };
  }

  if (!name && dateTime) {
    return {
      handled: true,
      intent: "ask-missing-name",
      assistantText: "Nice, I have the timing. What would you like to call this party?",
      actions: [],
    };
  }

  if (hasDateSignal && !parsedDate) {
    return {
      handled: true,
      intent: "ask-unparseable-datetime",
      assistantText: "I couldn't quite parse that date/time. Can you share it like \"Saturday at 7pm\" or \"March 15 at 6pm\"?",
      actions: [],
    };
  }

  if (hasPartySignal) {
    return {
      handled: true,
      intent: "ask-missing-name",
      assistantText: "Fun. What should we call this party, and when is it happening?",
      actions: [],
    };
  }

  return {
    handled: false,
    reason: "no-signal",
  };
}
