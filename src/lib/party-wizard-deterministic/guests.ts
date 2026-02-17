import type { WizardState } from "../wizard-schemas";
import { findGuestMatchIndexes } from "../party-wizard-actions/guests";
import type {
  DeterministicHandledResult,
  DeterministicUnhandledResult,
  GuestsDeterministicIntent,
} from "./types";

interface GuestsDeterministicInput {
  text: string;
  currentData: Partial<WizardState>;
}

const ADD_SIGNAL_REGEX = /\b(add|invite|include|put\s+on\s+the\s+list|bring\s+in)\b/i;
const REMOVE_SIGNAL_REGEX = /\b(remove|delete|drop|take\s+off)\b/i;
const DONE_SIGNAL_REGEX = /\b(done|that'?s\s+all|thats\s+all|no\s+more|ready|move\s+on|proceed)\b/i;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /\+?\d[\d().\-\s]{6,}\d/g;

function containsEmail(text: string): boolean {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}

const ORDINAL_TO_INDEX: Record<string, number> = {
  first: 0,
  second: 1,
  third: 2,
  fourth: 3,
  fifth: 4,
  sixth: 5,
  seventh: 6,
  eighth: 7,
  ninth: 8,
  tenth: 9,
};

function isShortNegativeDoneSignal(text: string): boolean {
  return /^(?:no|nope|nah|none)(?:[.!?]+)?$/i.test(text.trim());
}

function clean(value: string): string {
  return value.trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripLeadingGuestVerbs(value: string): string {
  return value
    .replace(/^\s*(?:add|invite|include|also|and|please)\s+/i, "")
    .replace(/^\s*(?:guest\s*:?)/i, "")
    .trim();
}

function parseSegment(segment: string, allowNameOnly: boolean): { name?: string; email?: string; phone?: string } | null {
  let working = stripLeadingGuestVerbs(segment);
  if (!working) return null;

  const emailMatch = working.match(EMAIL_REGEX);
  const email = emailMatch?.[0];
  if (email) {
    working = working.replace(email, " ");
  }

  const phoneMatch = working.match(PHONE_REGEX);
  const phone = phoneMatch?.[0] ? normalizeWhitespace(phoneMatch[0]) : undefined;
  if (phone) {
    working = working.replace(phone, " ");
  }

  working = working.replace(/[-–—:()]/g, " ");
  working = normalizeWhitespace(working);

  const name = working.length > 0 ? working : undefined;
  if (!email && !phone && !allowNameOnly) {
    return null;
  }
  if (!name && !email && !phone) {
    return null;
  }

  return {
    name,
    email,
    phone,
  };
}

function parseGuestEntries(text: string): Array<{ name?: string; email?: string; phone?: string }> {
  const addSignal = ADD_SIGNAL_REGEX.test(text);
  const structured = text.includes("\n") || text.includes(";") || text.includes("-") || text.includes("–");
  const allowNameOnly = addSignal || structured;

  let segments: string[];
  if (text.includes("\n")) {
    segments = text.split(/\n+/);
  } else if (text.includes(";")) {
    segments = text.split(";");
  } else if (text.includes(",") && containsEmail(text)) {
    segments = text.split(",");
  } else {
    segments = [text];
  }

  const guests = segments
    .map((segment) => parseSegment(clean(segment), allowNameOnly))
    .filter((guest): guest is { name?: string; email?: string; phone?: string } => Boolean(guest));

  return guests;
}

function parseRemoveIndex(text: string): number | null {
  const explicitIndex = text.match(/(?:#|number\s*)(\d+)/i) || text.match(/\bremove\s+(\d+)\b/i);
  if (explicitIndex?.[1]) {
    const parsed = Number(explicitIndex[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed - 1;
    }
  }

  for (const [ordinal, index] of Object.entries(ORDINAL_TO_INDEX)) {
    if (new RegExp(`\\b${ordinal}\\b`, "i").test(text)) {
      return index;
    }
  }

  return null;
}

function parseRemoveTarget(text: string): { name?: string; email?: string; phone?: string } {
  const email = text.match(EMAIL_REGEX)?.[0];
  const phone = text.match(PHONE_REGEX)?.[0];

  let name: string | undefined;
  const nameMatch = text.match(/\bremove\s+([^,.!?\n]{1,60})/i);
  if (nameMatch?.[1]) {
    name = normalizeWhitespace(
      nameMatch[1]
        .replace(/^(?:guest\s*)/i, "")
        .replace(/^(?:named\s*)/i, "")
    );
  }

  return { name, email, phone };
}

export function resolveDeterministicGuestsTurn(
  input: GuestsDeterministicInput
): DeterministicHandledResult<GuestsDeterministicIntent> | DeterministicUnhandledResult {
  const text = input.text.trim();
  if (!text) {
    return { handled: false, reason: "no-signal" };
  }

  const guestList = input.currentData.guestList || [];

  if (REMOVE_SIGNAL_REGEX.test(text)) {
    const removeIndex = parseRemoveIndex(text);
    if (removeIndex !== null) {
      return {
        handled: true,
        intent: "remove-guest",
        assistantText: "Got it. I removed that guest from the list.",
        actions: [{ type: "remove-guest", payload: { index: removeIndex } }],
      };
    }

    const target = parseRemoveTarget(text);
    const matches = findGuestMatchIndexes(guestList, target);

    if (matches.length === 1) {
      return {
        handled: true,
        intent: "remove-guest",
        assistantText: "Got it. I removed that guest from the list.",
        actions: [{ type: "remove-guest", payload: { index: matches[0] } }],
      };
    }

    if (matches.length > 1) {
      return {
        handled: true,
        intent: "ask-guest-clarification",
        assistantText: "I found more than one matching guest. Which one should I remove?",
        actions: [],
      };
    }

    return {
      handled: true,
      intent: "ask-guest-clarification",
      assistantText: "I couldn't find that guest in the list. Could you share the exact name or email?",
      actions: [],
    };
  }

  const guestsToAdd = parseGuestEntries(text);
  if (guestsToAdd.length > 0 && (ADD_SIGNAL_REGEX.test(text) || /[-@+\d\n;]/.test(text))) {
    const addedNames = guestsToAdd
      .map((guest) => guest.name || guest.email || guest.phone || "guest")
      .slice(0, 3);
    const nameSummary = addedNames.join(", ");

    return {
      handled: true,
      intent: "add-guests",
      assistantText: guestsToAdd.length === 1
        ? `Added ${nameSummary} to the guest list. Anyone else to add?`
        : `Added ${nameSummary}${guestsToAdd.length > 3 ? " and more" : ""} to the guest list. Anyone else to add?`,
      actions: guestsToAdd.map((guest) => ({ type: "add-guest" as const, payload: guest })),
    };
  }

  if (DONE_SIGNAL_REGEX.test(text) || isShortNegativeDoneSignal(text)) {
    return {
      handled: true,
      intent: "confirm-guest-list",
      assistantText: "Wonderful. Here is your guest list for confirmation.",
      actions: [{ type: "confirm-guest-list", payload: {} }],
    };
  }

  if (ADD_SIGNAL_REGEX.test(text)) {
    return {
      handled: true,
      intent: "ask-guest-clarification",
      assistantText: "Happy to add them. Please share a name, email, or phone for each guest.",
      actions: [],
    };
  }

  return {
    handled: false,
    reason: "no-signal",
  };
}
