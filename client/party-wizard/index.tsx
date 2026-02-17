import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { PartyWizardModal } from "./PartyWizardModal";
import { PartyWizardChat } from "./PartyWizardChat";

// Re-export components
export { PartyWizardModal } from "./PartyWizardModal";
export { PartyWizardChat } from "./PartyWizardChat";
export { WizardProgress } from "./WizardProgress";
export { WizardCreating } from "./WizardCreating";
export { RecipePicker } from "./RecipePicker";
export { WizardSidebar } from "./WizardSidebar";
export { MobileSidebarTrigger, DesktopSidebarAside } from "./WizardSidebarContainer";
export { useWizardState } from "./useWizardState";

// Types
export type { WizardStep, WizardState, PartyInfoData, GuestData, MenuPlanData, TimelineTaskData } from "./types";

interface PartyWizardAppProps {
  manualUrl?: string;
}

function PartyWizardApp({ manualUrl = "/parties/new" }: PartyWizardAppProps) {
  const [showModal, setShowModal] = useState(true);
  const [showChat, setShowChat] = useState(false);

  function handleChooseChat() {
    setShowModal(false);
    setShowChat(true);
  }

  function handleChooseManual() {
    window.location.href = manualUrl;
  }

  function handleCancel() {
    // Go back to parties list
    window.location.href = "/parties";
  }

  function handleComplete(partyUrl: string) {
    window.location.href = partyUrl;
  }

  if (showChat) {
    // Mobile: full bleed with negative margins to escape main padding, minus header height (~65px).
    // Keep a fixed available height so only the messages pane scrolls while steps/composer stay pinned.
    // Desktop: contained with max-width.
    return (
      <div className="-mx-4 -my-8 h-[calc(100dvh-65px)] md:mx-auto md:my-0 md:h-[calc(100dvh-65px)] md:max-w-5xl flex flex-col">
        <PartyWizardChat onComplete={handleComplete} onCancel={handleCancel} />
      </div>
    );
  }

  return (
    <PartyWizardModal
      isOpen={showModal}
      onClose={handleCancel}
      onChooseChat={handleChooseChat}
      onChooseManual={handleChooseManual}
    />
  );
}

// Initialize when DOM is ready
function init() {
  const root = document.getElementById("party-wizard-root");
  if (!root) return;

  const manualUrl = root.dataset.manualUrl || "/parties/new";
  createRoot(root).render(<PartyWizardApp manualUrl={manualUrl} />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { PartyWizardApp };
