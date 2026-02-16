type ParsedTime = {
  hours: number;
  minutes: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const QUALIFIER_PATTERN = "this|next|coming|following";
const WEEKDAY_PATTERN = "sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat";
const MONTH_PATTERN = "january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec";

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function applyTime(date: Date, parsedTime?: ParsedTime | null): Date {
  if (!parsedTime) return date;
  date.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
  return date;
}

function parseTime(input: string): ParsedTime | null {
  const amPmMatch = input.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (amPmMatch) {
    const hour = Number(amPmMatch[1]);
    const minute = amPmMatch[2] ? Number(amPmMatch[2]) : 0;
    const meridiem = amPmMatch[3].toLowerCase();

    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
      return null;
    }

    const hours = meridiem === "pm" && hour !== 12
      ? hour + 12
      : meridiem === "am" && hour === 12
        ? 0
        : hour;
    return { hours, minutes: minute };
  }

  const twentyFourHourMatch = input.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHourMatch) {
    return {
      hours: Number(twentyFourHourMatch[1]),
      minutes: Number(twentyFourHourMatch[2]),
    };
  }

  return null;
}

function parseRelativeDate(input: string, now: Date, parsedTime: ParsedTime | null): Date | null {
  const weekendMatch = input.match(new RegExp(`\\b(?:(${QUALIFIER_PATTERN})\\s+)?weekend\\b`, "i"));
  const weekdayMatch = input.match(new RegExp(`\\b(?:(${QUALIFIER_PATTERN})\\s+)?(${WEEKDAY_PATTERN})\\b`, "i"));

  if (/\btomorrow\b/i.test(input)) {
    const tomorrow = applyTime(addDays(startOfDay(now), 1), parsedTime);
    return tomorrow;
  }

  if (/\btoday\b/i.test(input) || /\btonight\b/i.test(input)) {
    const today = applyTime(startOfDay(now), parsedTime ?? (/\btonight\b/i.test(input) ? { hours: 19, minutes: 0 } : null));
    return today.getTime() > now.getTime() ? today : addDays(today, 1);
  }

  if (!weekendMatch && !weekdayMatch) {
    return null;
  }

  const weekendQualifier = weekendMatch?.[1]?.toLowerCase();
  const weekdayQualifier = weekdayMatch?.[1]?.toLowerCase();
  const qualifier = weekdayQualifier ?? weekendQualifier;
  const weekOffset = qualifier === "next" || qualifier === "following" ? 1 : 0;

  let targetWeekday: number | null = null;
  if (weekdayMatch?.[2]) {
    targetWeekday = WEEKDAY_INDEX[weekdayMatch[2].toLowerCase()] ?? null;
  } else if (weekendMatch) {
    // "this weekend" usually implies Saturday unless today is Sunday.
    targetWeekday = now.getDay() === 0 && weekOffset === 0 ? 0 : 6;
  }

  if (targetWeekday === null) {
    return null;
  }

  const nowDay = now.getDay();
  const daysUntilTarget = (targetWeekday - nowDay + 7) % 7;
  let candidate = applyTime(addDays(startOfDay(now), daysUntilTarget + weekOffset * 7), parsedTime);

  // Keep weekday/weekend references in the future by default.
  if (candidate.getTime() <= now.getTime()) {
    candidate = addDays(candidate, 7);
  }

  return candidate;
}

function parseMonthDayDate(input: string, now: Date, parsedTime: ParsedTime | null): Date | null {
  const monthDayRegex = new RegExp(`\\b(?:on\\s+)?(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, "i");
  const match = input.match(monthDayRegex);

  if (!match) {
    return null;
  }

  const monthToken = match[1].toLowerCase();
  const month = MONTH_INDEX[monthToken];
  const day = Number(match[2]);
  const providedYear = match[3] ? Number(match[3]) : null;

  if (month === undefined || day < 1 || day > 31) {
    return null;
  }

  const year = providedYear ?? now.getFullYear();
  let candidate = applyTime(new Date(year, month, day), parsedTime);

  // Reject impossible dates (e.g., February 31st).
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month || candidate.getDate() !== day) {
    return null;
  }

  // If no year is provided, assume the next occurrence in the future.
  if (!providedYear && candidate.getTime() <= now.getTime()) {
    candidate = applyTime(new Date(year + 1, month, day), parsedTime);
  }

  return candidate;
}

export function parsePartyDateTimeInput(input: string, now: Date = new Date()): Date | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const directParse = new Date(trimmed);
  if (!Number.isNaN(directParse.getTime())) {
    const hasExplicitYear = /\b\d{4}\b/.test(trimmed);
    if (hasExplicitYear || directParse.getTime() > now.getTime()) {
      return directParse;
    }

    // If the user omitted the year and the date would be in the past, shift to next year.
    const nextYear = new Date(directParse);
    while (nextYear.getTime() <= now.getTime()) {
      nextYear.setFullYear(nextYear.getFullYear() + 1);
    }
    return nextYear;
  }

  const lowered = trimmed.toLowerCase();
  const parsedTime = parseTime(lowered);

  const relativeDate = parseRelativeDate(lowered, now, parsedTime);
  if (relativeDate) {
    return relativeDate;
  }

  const monthDayDate = parseMonthDayDate(lowered, now, parsedTime);
  if (monthDayDate) {
    return monthDayDate;
  }

  return null;
}
