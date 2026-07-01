import type { AppProps } from "next/app";
import { Inter } from "next/font/google";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/lib/theme-context";
import { Toaster } from "@/components/ui/sonner";
import { useRouter } from "next/router";
import "../styles/globals.css";

// Inter is the DEFAULT body font, exposed as `--font-sans-default`.
// globals.css maps `--font-sans` → this default but lets a generated
// theme override `--font-sans`/`--font-heading` on `:root` (see
// styles/globals.css). Pinning `--font-sans` directly here would make
// the body font un-themeable, which is why it's indirected.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans-default" });

/** __AS_ERROR_FORWARD_V2__ — merge all console.error args; skip vague-only headlines (overlay sends full text). */
function formatConsoleErrorArgs(args: unknown[]): string {
  const parts: string[] = [];
  for (const a of args) {
    if (a == null) continue;
    if (typeof a === "string") {
      parts.push(a);
      continue;
    }
    if (a instanceof Error) {
      parts.push(a.message + (a.stack ? "\n" + a.stack.slice(0, 1200) : ""));
      continue;
    }
    try {
      parts.push(JSON.stringify(a));
    } catch {
      parts.push(String(a));
    }
  }
  return parts.join("\n").slice(0, 4000);
}

function shouldForwardToParent(formatted: string): boolean {
  const m = formatted;
  if (
    m.includes("Hydration") ||
    m.includes("hydration") ||
    m.includes("did not match") ||
    m.includes("Parsing ecmascript") ||
    m.includes("Build Error") ||
    m.includes("Runtime Error") ||
    m.includes("Unhandled Runtime") ||
    m.includes("Module not found") ||
    m.includes("Expected") ||
    m.includes("Unexpected token") ||
    m.includes("SyntaxError") ||
    // Route collisions: Next.js throws this from page-bootstrap.js when two
    // files claim the same URL (e.g. pages/foo.ts vs pages/foo/index.ts).
    // The parent overlay has a dedicated UI + delete button for this class;
    // it was being silently dropped here because the whitelist didn't cover
    // it.
    m.includes("Conflicting app and page file")
  ) {
    return true;
  }
  return false;
}

/** Do not forward a headline-only line; the _document overlay bridge posts the full Turbopack panel. */
function isVagueOnlyHeadline(formatted: string): boolean {
  const t = formatted.trim();
  return /^(Parsing ecmascript|Build Error|Runtime Error)\s*$/i.test(t);
}

// Intercept console.error at module level — runs when the JS bundle loads,
// BEFORE React begins hydration, so build errors and hydration mismatches are captured.
if (typeof window !== "undefined" && !(window as unknown as { __AS_ERROR_FORWARD__?: boolean }).__AS_ERROR_FORWARD__) {
  (window as unknown as { __AS_ERROR_FORWARD__: boolean }).__AS_ERROR_FORWARD__ = true;
  const _origError = console.error.bind(console);
  (console as any).error = (...args: unknown[]) => {
    _origError(...args);
    const formatted = formatConsoleErrorArgs(args);
    if (!formatted.trim()) return;
    if (!shouldForwardToParent(formatted)) return;
    if (isVagueOnlyHeadline(formatted)) return;
    const errorMsg = formatted.slice(0, 2500);
    try {
      window.parent?.postMessage({ type: "__AS_RUNTIME_ERROR__", message: errorMsg }, "*");
    } catch {
      /* ignore */
    }
  };
}

// Error reporter: captures thrown runtime errors and unhandled rejections,
// forwarding them to the AI builder for automatic fix suggestions.
function useErrorReporter() {
  useEffect(() => {
    const send = (msg: string, stack?: string) => {
      try {
        window.parent?.postMessage({ type: "__AS_RUNTIME_ERROR__", message: msg, stack }, "*");
      } catch {
        /* ignore */
      }
    };
    const onError = (e: ErrorEvent) =>
      send(e.message + (e.filename ? `\n  at ${e.filename}:${e.lineno}` : ""), e.error?.stack);
    const onUnhandled = (e: PromiseRejectionEvent) =>
      send(
        e.reason instanceof Error ? e.reason.message : String(e.reason),
        (e.reason as Error)?.stack
      );
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);
}

// Route reporter: reports client-side route changes to the parent iframe preview
// so that the platform UI's page switcher dropdown stays in sync.
function useRouteReporter() {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    try {
      const cleanRoute = router.pathname || "/";
      window.parent?.postMessage({ type: "ROUTE_NAVIGATED", route: cleanRoute }, "*");
    } catch {
      /* ignore */
    }
  }, [router.pathname, router.isReady]);
}

export default function App({ Component, pageProps }: AppProps) {
  useErrorReporter();
  useRouteReporter();

  const [editUrl, setEditUrl] = useState<string | null>(null);
  const [showEditButton, setShowEditButton] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const url = params.get("editUrl");
    if (url) {
      setEditUrl(url);
      const dismissed = sessionStorage.getItem("dual7-edit-dismissed");
      if (dismissed !== "true") {
        setShowEditButton(true);
      }
    }
  }, []);

  const handleCloseEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowEditButton(false);
    sessionStorage.setItem("dual7-edit-dismissed", "true");
  };

  const handleGoToEdit = () => {
    if (editUrl) {
      window.location.href = editUrl;
    }
  };

  // SessionProvider lets `useSession()` work across the app. The
  // NextAuth handler is provisioned at `pages/api/auth/[...nextauth].ts`
  // (Pages Router; locked, platform-managed). `pageProps.session` is
  // populated by NextAuth when present; otherwise SessionProvider
  // fetches it client-side on mount.
  return (
    <ThemeProvider>
      <SessionProvider session={pageProps.session}>
        <main className={`${inter.variable} font-sans antialiased`}>
          <Component {...pageProps} />
        </main>
        <Toaster richColors position="bottom-right" />

        {showEditButton && editUrl && (
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #d4d4d8',
              color: '#18181b',
            }}
            className="fixed bottom-4 right-4 z-[9999] flex items-center gap-1.5 rounded-full p-1.5 pl-3.5 pr-2.5 shadow-xl select-none"
          >
            <button
              type="button"
              onClick={handleGoToEdit}
              className="flex items-center gap-2 text-xs font-bold text-zinc-900 hover:text-indigo-600 transition-colors cursor-pointer"
            >
              <span className="flex items-center justify-center size-5 rounded-full bg-indigo-600 text-white font-extrabold text-[9px] shadow-[0_0_10px_rgba(99,102,241,0.5)]">
                D7
              </span>
              <span>Edit with Dual7</span>
            </button>
            
            <span className="w-px h-3.5 bg-zinc-200 mx-1.5" />
            
            <button
              type="button"
              onClick={handleCloseEdit}
              aria-label="Dismiss button"
              className="p-1 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800 transition-colors"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
      </SessionProvider>
    </ThemeProvider>
  );
}
