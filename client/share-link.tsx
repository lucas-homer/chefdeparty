import React, { useState, useCallback, MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import { Input } from "@/components/ui/input";

interface ShareLinkCardProps {
  shareUrl: string;
  title?: string;
  description?: string;
}

function ShareLinkCard({ shareUrl, title = "Share Link", description }: ShareLinkCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_err) {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl]);

  const handleInputClick = useCallback((e: MouseEvent<HTMLInputElement>) => {
    (e.target as HTMLInputElement).select();
  }, []);

  return (
    <div className="border rounded-lg p-4">
      {title && <h3 className="font-medium mb-2">{title}</h3>}
      {description && (
        <p className="text-sm text-muted-foreground mb-3">{description}</p>
      )}
      <div className="flex gap-2">
        <Input
          type="text"
          value={shareUrl}
          readOnly
          className="flex-1 h-10 bg-muted text-sm"
          onClick={handleInputClick}
        />
        <button
          type="button"
          onClick={handleCopy}
          className="px-4 py-2 text-sm border rounded-md hover:bg-muted flex items-center gap-2"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Initialize when DOM is ready
function init() {
  const roots = document.querySelectorAll("[data-share-link-root]");

  roots.forEach((root) => {
    const shareUrl = (root as HTMLElement).dataset.shareUrl;
    const title = (root as HTMLElement).dataset.title;
    const description = (root as HTMLElement).dataset.description;

    if (!shareUrl) return;

    createRoot(root as HTMLElement).render(
      <ShareLinkCard shareUrl={shareUrl} title={title} description={description} />
    );
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { ShareLinkCard };
