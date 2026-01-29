import type { FC, ReactNode } from "react";

interface LayoutProps {
  title?: string;
  user?: {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
  } | null;
  scripts?: string[];
  children?: ReactNode;
}

export const Layout: FC<LayoutProps> = ({
  title = "ChefDeParty",
  user,
  children,
  scripts = [],
}) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link href="/assets/main.css" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-background">
        {user && (
          <header className="border-b">
            <div className="container mx-auto px-4 py-4 flex items-center justify-between">
              <a href="/parties" className="text-xl font-bold hover:text-primary">
                ChefDeParty
              </a>
              <nav className="flex items-center gap-6">
                <a href="/parties" className="hidden md:block text-sm hover:text-primary">
                  Parties
                </a>
                <a href="/recipes" className="hidden md:block text-sm hover:text-primary">
                  Recipes
                </a>
                <div className="relative">
                  <button
                    type="button"
                    className="user-menu-trigger flex items-center justify-center w-8 h-8 rounded-full overflow-hidden hover:ring-2 hover:ring-primary/20 transition-all"
                    aria-expanded="false"
                    aria-haspopup="true"
                  >
                    {user.image ? (
                      <img
                        src={user.image}
                        alt={user.name || "User"}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                        {user.name?.charAt(0).toUpperCase() || "U"}
                      </span>
                    )}
                  </button>
                  <div className="user-menu hidden absolute right-0 top-full mt-2 w-56 rounded-md border bg-popover shadow-lg z-50">
                    <div className="p-3 flex items-center gap-3 border-b">
                      {user.image ? (
                        <img
                          src={user.image}
                          alt={user.name || "User"}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <span className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                          {user.name?.charAt(0).toUpperCase() || "U"}
                        </span>
                      )}
                      <div className="flex flex-col min-w-0">
                        {user.name && (
                          <span className="text-sm font-medium truncate">{user.name}</span>
                        )}
                        {user.email && (
                          <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                        )}
                      </div>
                    </div>
                    <div className="py-1 md:hidden border-b">
                      <a href="/parties" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        Parties
                      </a>
                      <a href="/recipes" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                        Recipes
                      </a>
                    </div>
                    <div className="py-1">
                      <a href="/settings" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        Settings
                      </a>
                    </div>
                    <div className="py-1 border-t">
                      <form action="/api/auth/signout" method="POST" className="signout-form">
                        <input type="hidden" name="csrfToken" className="csrf-token" defaultValue="" />
                        <button
                          type="submit"
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-accent text-left"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                          Sign out
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </nav>
            </div>
          </header>
        )}
        <main className="container mx-auto px-4 py-8">{children}</main>
        {scripts.map((src) => (
          <script key={src} type="module" src={src} />
        ))}
        {user && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                fetch('/api/auth/csrf')
                  .then(res => res.json())
                  .then(data => {
                    document.querySelectorAll('.csrf-token').forEach(el => {
                      el.value = data.csrfToken;
                    });
                  })
                  .catch(console.error);

                // User menu dropdown toggle
                const trigger = document.querySelector('.user-menu-trigger');
                const menu = document.querySelector('.user-menu');
                if (trigger && menu) {
                  trigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isOpen = !menu.classList.contains('hidden');
                    menu.classList.toggle('hidden');
                    trigger.setAttribute('aria-expanded', !isOpen);
                  });
                  document.addEventListener('click', (e) => {
                    if (!menu.contains(e.target) && !trigger.contains(e.target)) {
                      menu.classList.add('hidden');
                      trigger.setAttribute('aria-expanded', 'false');
                    }
                  });
                  document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                      menu.classList.add('hidden');
                      trigger.setAttribute('aria-expanded', 'false');
                    }
                  });
                }
              `,
            }}
          />
        )}
      </body>
    </html>
  );
};

export const PublicLayout: FC<{ title?: string; children?: ReactNode }> = ({
  title = "ChefDeParty",
  children,
}) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link href="/assets/main.css" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-background">
        <main>{children}</main>
      </body>
    </html>
  );
};
