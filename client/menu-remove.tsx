import React, { useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { CircleMinus } from "lucide-react";
import { Dialog } from "./guest-dialog";

interface MenuRemoveProps {
  partyId: string;
  menuItemId: string;
  recipeName: string;
}

function MenuRemoveButton({ partyId, menuItemId, recipeName }: MenuRemoveProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDialogOpen(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    setRemoving(true);
    const form = new FormData();
    form.append("_method", "DELETE");
    await fetch(`/api/parties/${partyId}/menu/${menuItemId}`, {
      method: "POST",
      body: form,
    });
    window.location.reload();
  }, [partyId, menuItemId]);

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="text-primary hover:text-primary/80 p-1"
        aria-label={`Remove ${recipeName}`}
      >
        <CircleMinus className="h-5 w-5" />
      </button>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Remove from menu?">
        <p className="text-sm text-muted-foreground mb-6">
          Remove <strong>{recipeName}</strong> from the menu?
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDialogOpen(false)}
            className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={removing}
            className="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50"
          >
            {removing ? "Removing..." : "Remove"}
          </button>
        </div>
      </Dialog>
    </>
  );
}

function init() {
  document.querySelectorAll<HTMLElement>("[data-menu-remove]").forEach((el) => {
    const partyId = el.dataset.partyId;
    const menuItemId = el.dataset.menuItemId;
    const recipeName = el.dataset.recipeName;
    if (!partyId || !menuItemId || !recipeName) return;

    createRoot(el).render(
      <MenuRemoveButton partyId={partyId} menuItemId={menuItemId} recipeName={recipeName} />
    );
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { MenuRemoveButton };
