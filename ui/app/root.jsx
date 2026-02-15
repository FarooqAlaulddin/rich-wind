import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { CORE_URL } from "./lib/core-url.server.js";

export function loader() {
  return { coreOrigin: CORE_URL };
}

export const links = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Space+Grotesk:wght@300..700&family=DM+Mono:wght@300;400;500&display=swap",
  },
];

export function Layout({ children, loaderData }) {
  const coreOrigin = loaderData?.coreOrigin || "";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {coreOrigin ? (
          <meta name="rw-core-origin" content={coreOrigin} />
        ) : null}
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        <script src="https://unpkg.com/htmx.org@1.9.12"></script>
        <script src="/scripts/layout-controls.js" />
        <script src="/scripts/preview-sync.js" />
        <script src="/scripts/auto-compile.js" />
        <script src="/scripts/action-feedback.js" />
        <script src="/scripts/splitter.js" />
        <script src="/scripts/pane-resizers.js" />
        <script src="/scripts/ui-toggles.js" />
        <script src="/scripts/api-panel.js" />
        <script src="/scripts/studio-boot.js" />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
