import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "../src/components/ui/drawer";

interface UserMenuProps {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
  };
  csrfToken: string;
}

function UserAvatar({ user, className }: { user: UserMenuProps["user"]; className?: string }) {
  if (user.image) {
    return (
      <img
        src={user.image}
        alt={user.name || "User"}
        className={`rounded-full object-cover ${className || ""}`}
      />
    );
  }

  return (
    <span className={`rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium ${className || ""}`}>
      {user.name?.charAt(0).toUpperCase() || "U"}
    </span>
  );
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <button type="button" onClick={toggle} className="theme-toggle">
      {isDark ? (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}

function UserMenu({ user, csrfToken }: UserMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="user-menu-trigger flex items-center justify-center w-8 h-8 rounded-full overflow-hidden hover:ring-2 hover:ring-primary/20 transition-all"
          aria-label="User menu"
        >
          <UserAvatar user={user} className="w-8 h-8" />
        </button>
      </DrawerTrigger>
      <DrawerContent
        direction="right"
        aria-labelledby="user-menu-title"
        className="h-full"
      >
        <DrawerHeader className="border-b">
          <div className="flex items-center gap-3">
            <UserAvatar user={user} className="w-12 h-12" />
            <div className="flex flex-col min-w-0">
              <DrawerTitle id="user-menu-title" className="truncate">
                {user.name || "User"}
              </DrawerTitle>
              {user.email && (
                <span className="text-sm text-muted-foreground truncate">
                  {user.email}
                </span>
              )}
            </div>
          </div>
          <DrawerClose asChild>
            <button
              type="button"
              className="absolute top-4 right-4 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Close"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </DrawerClose>
        </DrawerHeader>

        <nav className="flex-1 py-4">
          <a
            href="/parties"
            className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent transition-colors"
            onClick={() => setOpen(false)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            Parties
          </a>
          <a
            href="/recipes"
            className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent transition-colors"
            onClick={() => setOpen(false)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Recipes
          </a>
          <a
            href="/settings"
            className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent transition-colors"
            onClick={() => setOpen(false)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </a>
          <ThemeToggle />
        </nav>

        <div className="border-t p-4">
          <form action="/api/auth/signout" method="POST">
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <button
              type="submit"
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-destructive hover:bg-accent rounded-md transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// Initialize when DOM is ready
async function init() {
  const root = document.getElementById("user-menu-root");
  if (!root) return;

  const userJson = root.dataset.user;
  if (!userJson) return;

  let user: UserMenuProps["user"];
  try {
    user = JSON.parse(userJson);
  } catch {
    console.error("Failed to parse user data");
    return;
  }

  // Fetch CSRF token
  let csrfToken = "";
  try {
    const response = await fetch("/api/auth/csrf");
    const data = await response.json();
    csrfToken = data.csrfToken || "";
  } catch (err) {
    console.error("Failed to fetch CSRF token:", err);
  }

  createRoot(root).render(<UserMenu user={user} csrfToken={csrfToken} />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { UserMenu };
