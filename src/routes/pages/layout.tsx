import type { FC, ReactNode } from "react";

type MainSpacing = "default" | "none";

interface LayoutProps {
  title?: string;
  user?: {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
  } | null;
  scripts?: string[];
  mainSpacing?: MainSpacing;
  children?: ReactNode;
}

interface MainContainerProps {
  children?: ReactNode;
  spacing?: MainSpacing;
}

const darkModeScript = `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')})()`;

const seasonScript = `(function(){var m=new Date().getMonth();var s=m>=2&&m<=4?'haru':m>=5&&m<=7?'natsu':m>=8&&m<=10?'aki':'fuyu';var el=document.getElementById('season-mark');if(el)el.dataset.season=s})()`;

const phoneInputScript = `(function(){function n(v){var t=(v||'').trim();if(!t)return'';var d=t.replace(/\\D/g,'');return d?('+'+d):''}function b(i){if(i.dataset.phoneInputBound==='true')return;i.dataset.phoneInputBound='true';var a=function(){var x=n(i.value);if(x!==i.value)i.value=x};i.addEventListener('input',a);i.addEventListener('blur',a);if(i.value)a()}function init(r){(r||document).querySelectorAll('input[type="tel"]').forEach(b)}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){init()})}else{init()}new MutationObserver(function(m){m.forEach(function(mu){mu.addedNodes.forEach(function(node){if(!(node instanceof HTMLElement))return;if(node.matches('input[type="tel"]'))b(node);init(node)})})}).observe(document.documentElement,{childList:true,subtree:true})})()`;

export const Layout: FC<LayoutProps> = ({
  title = "ChefDeParty",
  user,
  children,
  scripts = [],
  mainSpacing = "default",
}) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="/assets/main.css" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: darkModeScript }} />
      </head>
      <body className="min-h-screen bg-background omakase-texture">
        {user && (
          <header className="nav-omakase sticky top-0 z-50">
            <div className="container mx-auto px-4 py-4 flex items-center justify-between">
              <a href="/parties" className="logo-omakase">
                ChefDeParty
              </a>
              <nav className="flex items-center gap-6">
                <a href="/parties" className="hidden md:block nav-link-omakase">
                  Parties
                </a>
                <a href="/recipes" className="hidden md:block nav-link-omakase">
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
                >
                  {/* Placeholder avatar to prevent layout shift during hydration */}
                  <div className="w-8 h-8 rounded-full overflow-hidden">
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
                  </div>
                </div>
              </nav>
            </div>
          </header>
        )}
        <MainContainer spacing={mainSpacing}>{children}</MainContainer>
        <script dangerouslySetInnerHTML={{ __html: phoneInputScript }} />
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
        {user && (
          <>
            <div id="season-mark" className="season-mark" />
            <script dangerouslySetInnerHTML={{ __html: seasonScript }} />
          </>
        )}
      </body>
    </html>
  );
};

export const MainContainer: FC<MainContainerProps> = ({
  children,
  spacing = "default",
}) => {
  const spacingClass = spacing === "none" ? "" : "py-8";

  return (
    <main className={`container mx-auto px-4 ${spacingClass}`.trim()}>
      {children}
    </main>
  );
};

export const PublicLayout: FC<{ title?: string; scripts?: string[]; children?: ReactNode }> = ({
  title = "ChefDeParty",
  scripts = [],
  children,
}) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="/assets/main.css" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: darkModeScript }} />
      </head>
      <body className="min-h-screen bg-background omakase-texture">
        <main>{children}</main>
        <script dangerouslySetInnerHTML={{ __html: phoneInputScript }} />
        {scripts.map((src) => (
          <script key={src} type="module" src={src} />
        ))}
      </body>
    </html>
  );
};
