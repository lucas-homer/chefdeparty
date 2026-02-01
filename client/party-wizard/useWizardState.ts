import { useState, useEffect, useCallback } from "react";
import type { UIMessage } from "ai";
import type {
  WizardStep,
  WizardSession,
} from "./types";

interface UseWizardStateResult {
  session: WizardSession | null;
  messages: UIMessage[];
  isLoading: boolean;
  error: string | null;
  setStep: (step: WizardStep) => Promise<void>;
  startNewSession: () => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshMessages: () => Promise<void>;
}

export function useWizardState(): UseWizardStateResult {
  const [session, setSession] = useState<WizardSession | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load or create session on mount
  useEffect(() => {
    loadSession();
  }, []);

  async function loadSession() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/parties/wizard/session");
      if (!response.ok) {
        throw new Error("Failed to load session");
      }
      const data = await response.json();
      setSession(data.session);
      setMessages(data.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      setIsLoading(false);
    }
  }

  const setStep = useCallback(async (step: WizardStep) => {
    if (!session) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/parties/wizard/session/${session.id}/step`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step }),
      });
      if (!response.ok) {
        throw new Error("Failed to change step");
      }
      const data = await response.json();
      setSession(data.session);
      setMessages(data.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change step");
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  const startNewSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/parties/wizard/session/new", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to start new session");
      }
      const data = await response.json();
      setSession(data.session);
      setMessages(data.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start new session");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh session state only (no messages) - for after tool results
  const refreshSession = useCallback(async () => {
    if (!session) return;

    try {
      const response = await fetch(`/api/parties/wizard/session/${session.id}`);
      if (!response.ok) {
        throw new Error("Failed to refresh session");
      }
      const data = await response.json();
      setSession(data.session);
    } catch (err) {
      console.error("Failed to refresh session:", err);
    }
  }, [session]);

  // Refresh messages for current step
  const refreshMessages = useCallback(async () => {
    if (!session) return;

    try {
      const response = await fetch(`/api/parties/wizard/session/${session.id}/step`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: session.currentStep }),
      });
      if (!response.ok) {
        throw new Error("Failed to refresh messages");
      }
      const data = await response.json();
      setSession(data.session);
      setMessages(data.messages || []);
    } catch (err) {
      console.error("Failed to refresh messages:", err);
    }
  }, [session]);

  return {
    session,
    messages,
    isLoading,
    error,
    setStep,
    startNewSession,
    refreshSession,
    refreshMessages,
  };
}
