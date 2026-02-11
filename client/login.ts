function setMessage(type: "error" | "success" | "info", message: string) {
  const messageDiv = document.getElementById("message");
  if (!messageDiv) return;

  const className =
    type === "error"
      ? "error-message"
      : type === "success"
        ? "success-message"
        : "info-message";

  messageDiv.innerHTML = `<div class="${className}">${message}</div>`;
}

function clearMessage() {
  const messageDiv = document.getElementById("message");
  if (!messageDiv) return;
  messageDiv.innerHTML = "";
}

function toggleView(view: "signin" | "register") {
  const signinView = document.getElementById("signin-view");
  const registerView = document.getElementById("register-view");

  if (!signinView || !registerView) return;

  clearMessage();

  if (view === "register") {
    signinView.classList.add("hidden");
    registerView.classList.remove("hidden");
  } else {
    registerView.classList.add("hidden");
    signinView.classList.remove("hidden");
  }
}

function switchTab(tab: string) {
  const isRegister = tab.startsWith("register-");
  const viewId = isRegister ? "register-view" : "signin-view";
  const view = document.getElementById(viewId);
  const tabContent = document.getElementById(`${tab}-tab`);
  if (!view || !tabContent) return;

  view.querySelectorAll<HTMLButtonElement>(".tab").forEach((button) => {
    button.classList.remove("active");
  });
  view.querySelectorAll<HTMLElement>(".tab-content").forEach((content) => {
    content.classList.remove("active");
  });

  const button = view.querySelector<HTMLButtonElement>(`.tab[data-tab="${tab}"]`);
  button?.classList.add("active");
  tabContent.classList.add("active");
  clearMessage();
}

async function handleEmailSignIn(event: SubmitEvent) {
  event.preventDefault();

  const form = event.currentTarget as HTMLFormElement | null;
  const emailInput = document.getElementById("email") as HTMLInputElement | null;
  const csrfInput = document.getElementById("csrf-token-email") as HTMLInputElement | null;
  const emailBtn = document.getElementById("email-btn") as HTMLButtonElement | null;
  if (!form || !emailInput || !csrfInput || !emailBtn) return;

  const email = emailInput.value.trim();
  if (!email) {
    setMessage("error", "Please enter your email address.");
    return;
  }

  const callbackUrl =
    (form.querySelector('input[name="callbackUrl"]') as HTMLInputElement | null)?.value ||
    "/parties";

  emailBtn.disabled = true;
  emailBtn.textContent = "Sending...";

  try {
    const response = await fetch("/api/auth/signin/resend", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        csrfToken: csrfInput.value,
        email,
        callbackUrl,
      }),
    });

    if (response.redirected) {
      window.location.href = response.url;
      return;
    }

    if (response.ok) {
      setMessage("info", "Check your email! We sent you a sign-in link. It may take a minute to arrive.");
      emailBtn.textContent = "Email Sent";
      return;
    }

    throw new Error("Failed to send email");
  } catch (_err) {
    setMessage("error", "Failed to send magic link. Please try again.");
    emailBtn.disabled = false;
    emailBtn.textContent = "Send Magic Link";
  }
}

async function registerWithEmail(callbackUrl: string) {
  const inviteCodeInput = document.getElementById("invite-code") as HTMLInputElement | null;
  const emailInput = document.getElementById("register-email") as HTMLInputElement | null;
  const csrfInput = document.getElementById("csrf-token-email") as HTMLInputElement | null;
  const registerBtn = document.getElementById("register-email-btn") as HTMLButtonElement | null;
  if (!inviteCodeInput || !emailInput || !csrfInput || !registerBtn) return;

  const code = inviteCodeInput.value.trim();
  const email = emailInput.value.trim();

  if (!code) {
    setMessage("error", "Please enter an invite code.");
    return;
  }
  if (!email) {
    setMessage("error", "Please enter your email address.");
    return;
  }

  registerBtn.disabled = true;
  registerBtn.textContent = "Validating...";

  try {
    const validateResponse = await fetch("/api/invite-codes/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, email }),
    });

    const validateData = (await validateResponse.json()) as {
      valid?: boolean;
      error?: string;
    };

    if (!validateData.valid) {
      setMessage("error", validateData.error || "Invalid invite code.");
      registerBtn.disabled = false;
      registerBtn.textContent = "Register with Email";
      return;
    }

    registerBtn.textContent = "Sending...";

    const response = await fetch("/api/auth/signin/resend", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        csrfToken: csrfInput.value,
        email,
        callbackUrl,
      }),
    });

    if (response.redirected) {
      window.location.href = response.url;
      return;
    }

    if (response.ok) {
      setMessage("info", "Check your email! We sent you a sign-in link to complete your registration.");
      registerBtn.textContent = "Email Sent";
      return;
    }

    throw new Error("Failed to send registration email");
  } catch (_err) {
    setMessage("error", "An error occurred. Please try again.");
    registerBtn.disabled = false;
    registerBtn.textContent = "Register with Email";
  }
}

async function handleGoogleRegister(event: SubmitEvent) {
  event.preventDefault();

  const inviteCodeInput = document.getElementById("invite-code") as HTMLInputElement | null;
  const emailInput = document.getElementById("register-email") as HTMLInputElement | null;
  const form = event.currentTarget as HTMLFormElement | null;
  if (!inviteCodeInput || !emailInput || !form) return;

  const code = inviteCodeInput.value.trim();
  const email = emailInput.value.trim();

  if (!code) {
    setMessage("error", "Please enter an invite code.");
    return;
  }
  if (!email) {
    setMessage("error", "Please enter your Google account email.");
    return;
  }

  try {
    const validateResponse = await fetch("/api/invite-codes/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, email }),
    });

    const validateData = (await validateResponse.json()) as {
      valid?: boolean;
      error?: string;
    };

    if (!validateData.valid) {
      setMessage("error", validateData.error || "Invalid invite code.");
      return;
    }

    form.submit();
  } catch (_err) {
    setMessage("error", "An error occurred. Please try again.");
  }
}

async function sendOtp(phoneInputId: string, inviteCode?: string) {
  const phoneInput = document.getElementById(phoneInputId) as HTMLInputElement | null;
  const sendBtnId = phoneInputId === "phone" ? "send-otp-btn" : "register-send-otp-btn";
  const sendBtn = document.getElementById(sendBtnId) as HTMLButtonElement | null;
  if (!phoneInput || !sendBtn) return;

  const phone = phoneInput.value.trim();
  if (!phone) {
    setMessage("error", "Please enter your phone number.");
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = "Sending...";

  try {
    const payload: { phone: string; inviteCode?: string } = { phone };
    if (inviteCode) payload.inviteCode = inviteCode;

    const response = await fetch("/api/phone-auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as {
      success?: boolean;
      requiresInvite?: boolean;
      error?: string;
    };

    if (!data.success) {
      if (data.requiresInvite) {
        setMessage("error", "New user? Please use the \"First time? I have an invite code\" link below to register.");
      } else {
        setMessage("error", data.error || "Failed to send verification code.");
      }
      sendBtn.disabled = false;
      sendBtn.textContent = phoneInputId === "phone" ? "Send Code" : "Register with Phone";
      return;
    }

    if (phoneInputId === "phone") {
      const phoneDisplay = document.getElementById("phone-display");
      const step1 = document.getElementById("phone-step-1");
      const step2 = document.getElementById("phone-step-2");
      if (phoneDisplay) phoneDisplay.textContent = phone;
      step1?.classList.add("hidden");
      step2?.classList.remove("hidden");
      (document.getElementById("otp-code") as HTMLInputElement | null)?.focus();
    } else {
      const phoneDisplay = document.getElementById("register-phone-display");
      const step1 = document.getElementById("register-phone-step-1");
      const step2 = document.getElementById("register-phone-step-2");
      if (phoneDisplay) phoneDisplay.textContent = phone;
      step1?.classList.add("hidden");
      step2?.classList.remove("hidden");
      (document.getElementById("register-otp-code") as HTMLInputElement | null)?.focus();
    }

    setMessage("info", "Verification code sent! Check your phone.");
    const root = document.getElementById("login-root") as HTMLElement | null;
    if (root) root.dataset[phoneInputId === "phone" ? "currentPhone" : "currentRegisterPhone"] = phone;
  } catch (_err) {
    setMessage("error", "Failed to send verification code. Please try again.");
    sendBtn.disabled = false;
    sendBtn.textContent = phoneInputId === "phone" ? "Send Code" : "Register with Phone";
  }
}

async function verifyOtp(otpInputId: string, callbackUrl: string) {
  const otpInput = document.getElementById(otpInputId) as HTMLInputElement | null;
  const verifyBtnId = otpInputId === "otp-code" ? "verify-otp-btn" : "register-verify-otp-btn";
  const verifyBtn = document.getElementById(verifyBtnId) as HTMLButtonElement | null;
  const root = document.getElementById("login-root") as HTMLElement | null;
  if (!otpInput || !verifyBtn || !root) return;

  const code = otpInput.value.trim();
  if (!code || code.length !== 6) {
    setMessage("error", "Please enter the 6-digit code.");
    return;
  }

  const phone =
    otpInputId === "otp-code" ? root.dataset.currentPhone : root.dataset.currentRegisterPhone;
  if (!phone) {
    setMessage("error", "Phone number missing. Please request a new code.");
    return;
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = "Verifying...";

  try {
    const response = await fetch("/api/phone-auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    });

    const data = (await response.json()) as { success?: boolean; error?: string };
    if (data.success) {
      setMessage("success", "Verified! Redirecting...");
      window.location.href = callbackUrl;
      return;
    }

    setMessage("error", data.error || "Invalid code.");
    verifyBtn.disabled = false;
    verifyBtn.textContent = "Verify Code";
  } catch (_err) {
    setMessage("error", "Failed to verify code. Please try again.");
    verifyBtn.disabled = false;
    verifyBtn.textContent = "Verify Code";
  }
}

function backToPhoneInput() {
  document.getElementById("phone-step-1")?.classList.remove("hidden");
  document.getElementById("phone-step-2")?.classList.add("hidden");
  const otpInput = document.getElementById("otp-code") as HTMLInputElement | null;
  const sendBtn = document.getElementById("send-otp-btn") as HTMLButtonElement | null;
  if (otpInput) otpInput.value = "";
  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.textContent = "Send Code";
  }
  clearMessage();
}

function backToRegisterPhoneInput() {
  document.getElementById("register-phone-step-1")?.classList.remove("hidden");
  document.getElementById("register-phone-step-2")?.classList.add("hidden");
  const otpInput = document.getElementById("register-otp-code") as HTMLInputElement | null;
  const sendBtn = document.getElementById("register-send-otp-btn") as HTMLButtonElement | null;
  if (otpInput) otpInput.value = "";
  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.textContent = "Register with Phone";
  }
  clearMessage();
}

function init() {
  const root = document.getElementById("login-root") as HTMLElement | null;
  if (!root) return;

  const callbackUrl = root.dataset.callbackUrl || "/parties";

  fetch("/api/auth/csrf")
    .then((response) => response.json())
    .then((data: { csrfToken: string }) => {
      const emailToken = document.getElementById("csrf-token-email") as HTMLInputElement | null;
      const googleToken = document.getElementById("csrf-token-google") as HTMLInputElement | null;
      const googleRegisterToken = document.getElementById("csrf-token-google-register") as HTMLInputElement | null;
      if (emailToken) emailToken.value = data.csrfToken;
      if (googleToken) googleToken.value = data.csrfToken;
      if (googleRegisterToken) googleRegisterToken.value = data.csrfToken;
    })
    .catch(() => {
      setMessage("error", "Unable to initialize authentication. Please refresh.");
    });

  document.querySelectorAll<HTMLButtonElement>(".tab[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  document.getElementById("to-register-btn")?.addEventListener("click", () => toggleView("register"));
  document.getElementById("to-signin-btn")?.addEventListener("click", () => toggleView("signin"));

  document.getElementById("email-form")?.addEventListener("submit", (event) => {
    void handleEmailSignIn(event as SubmitEvent);
  });

  document.getElementById("register-email-btn")?.addEventListener("click", () => {
    void registerWithEmail(callbackUrl);
  });

  document.getElementById("google-register-form")?.addEventListener("submit", (event) => {
    void handleGoogleRegister(event as SubmitEvent);
  });

  document.getElementById("send-otp-btn")?.addEventListener("click", () => {
    void sendOtp("phone");
  });
  document.getElementById("resend-btn")?.addEventListener("click", () => {
    void sendOtp("phone");
  });
  document.getElementById("verify-otp-btn")?.addEventListener("click", () => {
    void verifyOtp("otp-code", callbackUrl);
  });
  document.getElementById("back-phone-btn")?.addEventListener("click", backToPhoneInput);

  document.getElementById("register-send-otp-btn")?.addEventListener("click", () => {
    const inviteCode = (document.getElementById("invite-code") as HTMLInputElement | null)?.value.trim();
    if (!inviteCode) {
      setMessage("error", "Please enter an invite code.");
      return;
    }
    void sendOtp("register-phone", inviteCode);
  });
  document.getElementById("resend-register-btn")?.addEventListener("click", () => {
    const inviteCode = (document.getElementById("invite-code") as HTMLInputElement | null)?.value.trim();
    if (!inviteCode) {
      setMessage("error", "Please enter an invite code.");
      return;
    }
    void sendOtp("register-phone", inviteCode);
  });
  document.getElementById("register-verify-otp-btn")?.addEventListener("click", () => {
    void verifyOtp("register-otp-code", callbackUrl);
  });
  document.getElementById("back-register-phone-btn")?.addEventListener("click", backToRegisterPhoneInput);

  const inviteCodeInput = document.getElementById("invite-code") as HTMLInputElement | null;
  inviteCodeInput?.addEventListener("input", () => {
    inviteCodeInput.value = inviteCodeInput.value.toUpperCase();
  });

  const otpInput = document.getElementById("otp-code") as HTMLInputElement | null;
  otpInput?.addEventListener("input", () => {
    otpInput.value = otpInput.value.replace(/[^0-9]/g, "").slice(0, 6);
  });
  const registerOtpInput = document.getElementById("register-otp-code") as HTMLInputElement | null;
  registerOtpInput?.addEventListener("input", () => {
    registerOtpInput.value = registerOtpInput.value.replace(/[^0-9]/g, "").slice(0, 6);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
