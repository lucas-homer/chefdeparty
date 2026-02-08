import React, { useState } from "react";
import { ChevronUp } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { WizardSidebar } from "./WizardSidebar";
import type { WizardSidebarProps } from "./WizardSidebar";

export interface WizardSidebarContainerProps extends WizardSidebarProps {
  triggerIcon: React.ReactNode;
  triggerLabel: string;
}

/**
 * Mobile trigger bar + bottom drawer for the wizard sidebar.
 * Renders a compact bar showing item count; tapping opens a bottom drawer
 * with the full item list. Hidden on desktop (md+).
 *
 * Place this inside the input area, above the form element.
 */
export function MobileSidebarTrigger({
  triggerIcon,
  triggerLabel,
  ...sidebarProps
}: WizardSidebarContainerProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const count = sidebarProps.items.length;

  if (count === 0) return null;

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="w-full flex items-center justify-between px-3 py-2 mb-3 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors text-sm"
      >
        <span className="flex items-center gap-2">
          {triggerIcon}
          <span>
            {count} {triggerLabel}
          </span>
        </span>
        <ChevronUp className="w-4 h-4 text-muted-foreground" />
      </button>

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        direction="bottom"
      >
        <DrawerContent direction="bottom">
          <DrawerHeader>
            <DrawerTitle>
              {sidebarProps.title} ({count})
            </DrawerTitle>
          </DrawerHeader>
          <div className="max-h-[60vh] overflow-y-auto px-4 pb-4">
            <WizardSidebar {...sidebarProps} />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/**
 * Desktop sidebar aside panel. Hidden on mobile (<md).
 * Place this as a sibling of the chat column in the flex layout.
 */
export function DesktopSidebarAside(props: WizardSidebarProps) {
  return (
    <div className="hidden md:block w-64 flex-shrink-0 border-l bg-muted/20">
      <WizardSidebar {...props} />
    </div>
  );
}
