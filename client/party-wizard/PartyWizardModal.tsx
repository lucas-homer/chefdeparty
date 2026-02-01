import React from "react";

interface PartyWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChooseChat: () => void;
  onChooseManual: () => void;
}

export function PartyWizardModal({
  isOpen,
  onClose,
  onChooseChat,
  onChooseManual,
}: PartyWizardModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Create a New Party</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            How would you like to set up your party?
          </p>
        </div>

        {/* Options */}
        <div className="px-6 pb-6 space-y-3">
          {/* Chat option */}
          <button
            onClick={onChooseChat}
            className="w-full p-4 border-2 border-primary rounded-lg text-left hover:bg-primary/5 transition-colors group"
          >
            <div className="flex items-start gap-4">
              <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                <svg
                  className="w-6 h-6 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium">Let's chat</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Chef will ask you questions and put everything together. Great for when you want
                  guidance.
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm text-primary font-medium">
              <span>Recommended</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </button>

          {/* Manual option */}
          <button
            onClick={onChooseManual}
            className="w-full p-4 border rounded-lg text-left hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start gap-4">
              <div className="p-2 bg-muted rounded-lg">
                <svg
                  className="w-6 h-6 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium">Manually fill out forms</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Traditional step-by-step forms. Best if you know exactly what you want.
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
