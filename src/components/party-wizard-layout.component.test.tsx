/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";

import { DesktopSidebarAside } from "../../client/party-wizard/WizardSidebarContainer";

describe("Party wizard layout", () => {
  it("uses bounded desktop sidebar containers so the sidebar can scroll internally", () => {
    render(
      <DesktopSidebarAside
        title="Guests"
        items={[
          { id: "guest-1", label: "Alex", sublabel: "alex@example.com" },
          { id: "guest-2", label: "Jordan", sublabel: "jordan@example.com" },
        ]}
        emptyMessage="No guests yet"
      />
    );

    const aside = screen.getByTestId("wizard-desktop-sidebar");
    const sidebarRoot = screen.getByTestId("wizard-sidebar-root");
    const sidebarList = screen.getByTestId("wizard-sidebar-list");

    expect(aside).toHaveClass("md:min-h-0");
    expect(aside).toHaveClass("md:overflow-hidden");
    expect(sidebarRoot).toHaveClass("h-full");
    expect(sidebarRoot).toHaveClass("min-h-0");
    expect(sidebarList).toHaveClass("min-h-0");
    expect(sidebarList).toHaveClass("overflow-y-auto");
  });
});
