// Admin page functionality for invite code management

function showMessage(type: "success" | "error", message: string) {
  const messageDiv = document.getElementById("admin-message");
  if (!messageDiv) return;

  messageDiv.innerHTML = `
    <div class="${
      type === "success"
        ? "bg-green-50 border-green-200 text-green-800"
        : "bg-red-50 border-red-200 text-red-800"
    } border rounded-lg p-4 text-sm">
      ${message}
    </div>
  `;

  // Auto-hide after 5 seconds
  setTimeout(() => {
    messageDiv.innerHTML = "";
  }, 5000);
}

async function generateCode(formData: FormData) {
  const maxUses = parseInt(formData.get("maxUses") as string) || 1;
  const note = formData.get("note") as string;
  const expiresAtStr = formData.get("expiresAt") as string;

  const body: { maxUses: number; note?: string; expiresAt?: string } = {
    maxUses,
  };
  if (note) body.note = note;
  if (expiresAtStr) body.expiresAt = new Date(expiresAtStr).toISOString();

  try {
    const response = await fetch("/api/invite-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (response.ok) {
      showMessage("success", `Code generated: ${data.code}`);
      // Reload page to show new code
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showMessage("error", data.error || "Failed to generate code");
    }
  } catch (_err) {
    showMessage("error", "An error occurred. Please try again.");
  }
}

async function deleteCode(codeId: string) {
  if (!confirm("Are you sure you want to delete this invite code?")) {
    return;
  }

  try {
    const response = await fetch(`/api/invite-codes/${codeId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      showMessage("success", "Code deleted");
      setTimeout(() => window.location.reload(), 1000);
    } else {
      const data = await response.json();
      showMessage("error", data.error || "Failed to delete code");
    }
  } catch (_err) {
    showMessage("error", "An error occurred. Please try again.");
  }
}

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);

    // Find the button and update text
    const btn = document.querySelector(
      `[data-code="${code}"]`
    ) as HTMLButtonElement;
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }
  } catch (_err) {
    // Fallback
    const input = document.createElement("input");
    input.value = code;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
  }
}

function init() {
  const generateBtn = document.getElementById("generate-code-btn");
  const generateModal = document.getElementById("generate-modal");
  const generateForm = document.getElementById(
    "generate-form"
  ) as HTMLFormElement;
  const cancelBtn = document.getElementById("cancel-generate-btn");

  // Show modal
  generateBtn?.addEventListener("click", () => {
    generateModal?.classList.remove("hidden");
  });

  // Hide modal
  cancelBtn?.addEventListener("click", () => {
    generateModal?.classList.add("hidden");
  });

  // Close modal on outside click
  generateModal?.addEventListener("click", (e) => {
    if (e.target === generateModal) {
      generateModal.classList.add("hidden");
    }
  });

  // Handle form submission
  generateForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(generateForm);
    generateModal?.classList.add("hidden");
    await generateCode(formData);
  });

  // Delete buttons
  document.querySelectorAll(".delete-code-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const codeId = (btn as HTMLElement).dataset.codeId;
      if (codeId) deleteCode(codeId);
    });
  });

  // Copy buttons
  document.querySelectorAll(".copy-code-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = (btn as HTMLElement).dataset.code;
      if (code) copyCode(code);
    });
  });

  // Close modal on escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      generateModal?.classList.add("hidden");
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
