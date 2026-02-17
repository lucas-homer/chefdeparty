export type DeterministicUnhandledReason =
  | "ambiguous"
  | "unsupported"
  | "low-confidence"
  | "no-signal";

export type PartyInfoDeterministicIntent =
  | "confirm-party-info"
  | "ask-missing-name"
  | "ask-missing-datetime"
  | "ask-unparseable-datetime";

export type GuestsDeterministicIntent =
  | "add-guests"
  | "remove-guest"
  | "confirm-guest-list"
  | "ask-guest-clarification";

export type DeterministicAction =
  | {
      type: "confirm-party-info";
      payload: {
        name: string;
        dateTimeInput?: string;
        resolvedDateTime?: Date;
        location?: string;
        description?: string;
        allowContributions?: boolean;
      };
    }
  | {
      type: "add-guest";
      payload: {
        name?: string;
        email?: string;
        phone?: string;
      };
    }
  | {
      type: "remove-guest";
      payload: {
        index: number;
      };
    }
  | {
      type: "confirm-guest-list";
      payload: Record<string, never>;
    };

export type DeterministicHandledResult<TIntent extends string> = {
  handled: true;
  intent: TIntent;
  assistantText: string;
  actions: DeterministicAction[];
};

export type DeterministicUnhandledResult = {
  handled: false;
  reason: DeterministicUnhandledReason;
};
