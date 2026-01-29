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
                <div
                  id="user-menu-root"
                  data-user={JSON.stringify({
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    image: user.image,
                  })}
                />
              </nav>
            </div>
          </header>
        )}
        <main className="container mx-auto px-4 py-8">{children}</main>
        {scripts.map((src) => (
          <script key={src} type="module" src={src} />
        ))}
        {user && (
          <script type="module" src="/assets/user-menu.js" />
        )}
        {user && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                // Fetch CSRF token for any forms that need it
                fetch('/api/auth/csrf')
                  .then(res => res.json())
                  .then(data => {
                    document.querySelectorAll('.csrf-token').forEach(el => {
                      el.value = data.csrfToken;
                    });
                  })
                  .catch(console.error);
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
