/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TimelinePreview } from "../../client/party-wizard/TimelinePreview";
import type { TimelineTaskData } from "../../client/party-wizard/types";

const baseTimeline: TimelineTaskData[] = [
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

describe("TimelinePreview", () => {
  it("submits timeline curation only when submit is clicked", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<TimelinePreview timeline={baseTimeline} onSubmit={onSubmit} />);

    await user.click(screen.getAllByTitle("Remove task")[1]);

    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /submit timeline changes/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        curatedTimeline: [baseTimeline[0]],
        hasChanges: true,
      })
    );
    expect(onSubmit.mock.calls[0][0].feedbackMessage).toContain("Remove these tasks");
    expect(onSubmit.mock.calls[0][0].feedbackMessage).toContain("Bake cookies");
  });

  it("submits unchanged timeline when no edits are made", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<TimelinePreview timeline={baseTimeline} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /submit timeline changes/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        curatedTimeline: baseTimeline,
        hasChanges: false,
      })
    );
    expect(onSubmit.mock.calls[0][0].feedbackMessage).toContain("no changes");
  });
});
