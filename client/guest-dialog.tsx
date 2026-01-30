import React, { useState, useCallback, useEffect, useRef, FormEvent, ChangeEvent, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { hc } from "hono/client";
import type { ApiRoutes } from "../src/routes/api";

// Create typed client
const client = hc<ApiRoutes>("/api");

// Dialog component with accessibility
interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

function Dialog({ open, onClose, children, title }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const focusable = dialogRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    (focusable?.[0] as HTMLElement)?.focus();
  }, [open]);

  // ESC to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={title ? "dialog-title" : undefined}>
      <div className="fixed inset-0 bg-black/80" onClick={onClose} />
      <div
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background rounded-lg p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-lg"
      >
        {title && (
          <h2 id="dialog-title" className="text-lg font-semibold mb-4">
            {title}
          </h2>
        )}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}

// Guest form inside the dialog
interface GuestFormProps {
  partyId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function GuestForm({ partyId, onSuccess, onCancel }: GuestFormProps) {
  const [contactType, setContactType] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setError(null);

      try {
        const response = await client.parties[":id"].guests.$post({
          param: { id: partyId },
          json: {
            email: contactType === "email" ? email : undefined,
            phone: contactType === "phone" ? phone : undefined,
            name: name || undefined,
          },
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error("error" in err ? err.error : "Failed to add guest");
        }

        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setSaving(false);
      }
    },
    [partyId, contactType, email, phone, name, onSuccess]
  );

  const isValidContact = contactType === "email" ? email.trim() !== "" : phone.trim() !== "";
  const isValid = isValidContact && (contactType === "email" || smsConsent);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Contact Type Tabs */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setContactType("email")}
          className={`flex-1 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            contactType === "email"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Email
        </button>
        <button
          type="button"
          onClick={() => setContactType("phone")}
          className={`flex-1 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            contactType === "phone"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Phone
        </button>
      </div>

      {contactType === "email" ? (
        <div className="space-y-2">
          <label className="text-sm font-medium">Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded-md"
            placeholder="guest@example.com"
            required
            autoFocus
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Phone *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="+1 (555) 555-1234"
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Include country code for international numbers
            </p>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={smsConsent}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSmsConsent(e.target.checked)}
              className="mt-0.5 rounded"
            />
            <span className="text-xs text-muted-foreground">
              I confirm I have this person's consent to receive SMS messages from this service
            </span>
          </label>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Name (optional)</label>
        <input
          type="text"
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          className="w-full px-3 py-2 border rounded-md"
          placeholder="Guest name"
        />
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !isValid}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add Guest"}
        </button>
      </div>
    </form>
  );
}

// Main component
interface AddGuestButtonProps {
  partyId: string;
  onGuestAdded?: () => void;
}

function AddGuestButton({ partyId, onGuestAdded }: AddGuestButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSuccess = useCallback(() => {
    setDialogOpen(false);
    onGuestAdded?.();
    // Refresh the page to show new guest
    window.location.reload();
  }, [onGuestAdded]);

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
        </svg>
        Add Guest
      </button>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Add Guest">
        <GuestForm
          partyId={partyId}
          onSuccess={handleSuccess}
          onCancel={() => setDialogOpen(false)}
        />
      </Dialog>
    </>
  );
}

// Initialize when DOM is ready
function init() {
  const root = document.getElementById("guest-dialog-root");
  if (!root) return;

  const partyId = root.dataset.partyId;
  if (!partyId) return;

  createRoot(root).render(<AddGuestButton partyId={partyId} />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { AddGuestButton, Dialog };
