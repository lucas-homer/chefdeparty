import React from "react";
import { X } from "lucide-react";

export interface WizardSidebarItem {
  id: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

export interface WizardSidebarProps {
  title: string;
  items: WizardSidebarItem[];
  onRemove?: (id: string) => void;
  emptyMessage: string;
  emptyHint?: string;
  footer?: React.ReactNode;
}

export function WizardSidebar({
  title,
  items,
  onRemove,
  emptyMessage,
  emptyHint,
  footer,
}: WizardSidebarProps) {
  return (
    <div data-testid="wizard-sidebar-root" className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="p-3 border-b">
        <h3 className="font-medium text-sm">
          {title} ({items.length})
        </h3>
      </div>

      {/* Item list */}
      <div data-testid="wizard-sidebar-list" className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            <p className="mb-2">{emptyMessage}</p>
            {emptyHint && <p className="text-xs">{emptyHint}</p>}
          </div>
        ) : (
          <ul className="p-2 space-y-1">
            {items.map((item) => (
              <li
                key={item.id}
                className="group flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 text-sm"
              >
                {item.icon && (
                  <span className="flex-shrink-0 text-muted-foreground">
                    {item.icon}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <span className="block truncate">{item.label}</span>
                  {item.sublabel && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.sublabel}
                    </span>
                  )}
                </div>
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity flex-shrink-0"
                    title="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Optional footer */}
      {footer && (
        <div className="p-3 border-t text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}
