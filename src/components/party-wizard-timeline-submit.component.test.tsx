/** @vitest-environment jsdom */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PartyWizardChat } from "../../client/party-wizard/PartyWizardChat";
import type { TimelineTaskData } from "../../client/party-wizard/types";

const mockSendMessage = vi.fn();
const mockSetMessages = vi.fn();
let onFinishHandler: ((event: { message: unknown }) => void) | undefined;

const timeline: TimelineTaskData[] = [
  {
    description: "Shop for ingredients",
    daysBeforeParty: 2,
    scheduledTime: "17:00",
    durationMinutes: 45,
    isPhaseStart: true,
  },
  {
    description: "Bake cookies",
    daysBeforeParty: 0,
    scheduledTime: "15:00",
    durationMinutes: 90,
    isPhaseStart: false,
  },
];

const initialMessages = [
  {
    id: "assistant-1",
    role: "assistant" as const,
    parts: [
      {
        type: "data-timeline-generated" as const,
        data: {
          timeline,
          message: "I've created your timeline.",
        },
      },
    ],
  },
];

vi.mock("@ai-sdk/react", () => ({
  useChat: (options?: { onFinish?: (event: { message: unknown }) => void }) => {
    onFinishHandler = options?.onFinish;
    return {
      messages: initialMessages,
      status: "ready",
      sendMessage: mockSendMessage,
      error: null,
      setMessages: mockSetMessages,
    };
  },
}));

vi.mock("../../client/party-wizard/useWizardState", () => ({
  useWizardState: () => ({
    session: {
      id: "session-1",
      userId: "user-1",
      currentStep: "timeline",
      furthestStepIndex: 3,
      partyInfo: {
        name: "Sunday Post-Run Meal",
        dateTime: new Date().toISOString(),
      },
      guestList: [],
      menuPlan: null,
      timeline,
      status: "active",
      partyId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    messages: initialMessages,
    isLoading: false,
    error: null,
    setStep: vi.fn(),
    startNewSession: vi.fn(),
    refreshSession: vi.fn(),
    refreshMessages: vi.fn(),
  }),
}));

vi.mock("../../client/party-wizard/WizardProgress", () => ({
  WizardProgress: () => <div data-testid="wizard-progress" />,
}));

vi.mock("../../client/party-wizard/WizardCreating", () => ({
  WizardCreating: () => null,
}));

vi.mock("../../client/party-wizard/RecipePicker", () => ({
  RecipePicker: () => null,
}));

vi.mock("../../client/party-wizard/WizardSidebarContainer", () => ({
  MobileSidebarTrigger: () => null,
  DesktopSidebarAside: () => null,
}));

describe("PartyWizardChat timeline submit", () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    mockSendMessage.mockClear();
    mockSetMessages.mockClear();
    onFinishHandler = undefined;
    vi.restoreAllMocks();
  });

  it("sends timeline adjustment feedback when submit is clicked", async () => {
    const user = userEvent.setup();
    render(<PartyWizardChat />);

    await user.click(screen.getAllByTitle("Remove task")[1]);
    await user.click(screen.getByRole("button", { name: /submit timeline changes/i }));

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith({
      text: expect.stringContaining("Remove these tasks"),
    });
  });

  it("surfaces API error details when party creation fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid wizard completion payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<PartyWizardChat />);

    expect(onFinishHandler).toBeDefined();
    await act(async () => {
      onFinishHandler?.({
        message: {
          id: "assistant-complete",
          role: "assistant",
          parts: [
            {
              type: "data-step-confirmed",
              data: { nextStep: "complete" },
            },
          ],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Invalid wizard completion payload")).toBeVisible();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
