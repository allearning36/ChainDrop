import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { lazy, Suspense, useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Always-eager: visited most often, must render instantly
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";

// Lazy-loaded: heavy pages or rarely visited → smaller initial bundle
const AboutPage      = lazy(() => import("@/pages/about"));
const ContactPage    = lazy(() => import("@/pages/contact"));
const PrivacyPage    = lazy(() => import("@/pages/privacy"));
const TermsPage      = lazy(() => import("@/pages/terms"));
const FAQPage        = lazy(() => import("@/pages/faq"));
const LookupPage     = lazy(() => import("@/pages/lookup"));
const StatusPage     = lazy(() => import("@/pages/status"));
const ExchangePage   = lazy(() => import("@/pages/exchange"));
const EarnDropPage   = lazy(() => import("@/pages/earn-drop"));
const AdminLogin     = lazy(() => import("@/pages/admin/login"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));

import "@/lib/auth";

interface IntegrationsConfig {
  googleAds?: { enabled?: boolean; publisherId?: string };
  googleAnalytics?: { enabled?: boolean; measurementId?: string };
  googleSearchConsole?: { verificationCode?: string };
  customMetaTags?: string;
}

// ── Integrations injection (AdSense, GA4, Search Console, custom meta tags) ──
function useIntegrations() {
  const injectedRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    fetch("/api/site-config/public")
      .then(r => r.ok ? r.json() : null)
      .then((d: { integrations?: IntegrationsConfig } | null) => {
        const cfg = d?.integrations ?? {};

        // Remove any previously injected elements
        injectedRef.current.forEach(el => el.remove());
        injectedRef.current = [];

        function inject(el: HTMLElement) {
          el.setAttribute("data-chaindrop-injected", "1");
          document.head.appendChild(el);
          injectedRef.current.push(el);
        }

        // ── Google AdSense ──────────────────────────────────────────────────
        const adsPublisherId = cfg.googleAds?.publisherId?.trim();
        if (cfg.googleAds?.enabled && adsPublisherId) {
          const s = document.createElement("script");
          s.async = true;
          s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsPublisherId}`;
          s.crossOrigin = "anonymous";
          inject(s);
        }

        // ── Google Analytics 4 ──────────────────────────────────────────────
        const gaMeasurementId = cfg.googleAnalytics?.measurementId?.trim();
        if (cfg.googleAnalytics?.enabled && gaMeasurementId) {
          const s = document.createElement("script");
          s.async = true;
          s.src = `https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`;
          inject(s);

          const inline = document.createElement("script");
          inline.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaMeasurementId}');`;
          inject(inline);
        }

        // ── Google Search Console verification ──────────────────────────────
        const gscCode = cfg.googleSearchConsole?.verificationCode?.trim();
        if (gscCode) {
          const meta = document.createElement("meta");
          meta.name = "google-site-verification";
          meta.content = gscCode;
          inject(meta);
        }

        // ── Custom meta tags (Monetag, Bitmedia, Coinzilla, Bing, etc.) ───────
        // cloneNode() does NOT execute <script> tags — must recreate each element
        // from scratch so the browser treats it as a fresh script and runs it.
        const raw = cfg.customMetaTags?.trim() ?? "";
        if (raw) {
          const temp = document.createElement("div");
          temp.innerHTML = raw;
          Array.from(temp.children).forEach(child => {
            const tag = child.tagName.toLowerCase();
            if (tag === "script") {
              const s = document.createElement("script");
              // Copy all attributes (src, async, data-zone, data-cfasync, …)
              Array.from(child.attributes).forEach(attr => s.setAttribute(attr.name, attr.value));
              // Copy inline script body if any
              if (child.textContent) s.textContent = child.textContent;
              inject(s);
            } else {
              // meta, link, etc. — cloneNode is fine for non-script tags
              inject(child.cloneNode(true) as HTMLElement);
            }
          });
        }
      })
      .catch(() => {});

    return () => {
      injectedRef.current.forEach(el => el.remove());
      injectedRef.current = [];
    };
  }, []);
}

// ── Page-view tracking ────────────────────────────────────────────────────────
// Send one beacon per page navigation. Uses sessionStorage to deduplicate
// rapid re-renders, but fires again when the path changes (SPA navigation).
function trackPageView(path: string): void {
  const key = `tracked:${path}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
    keepalive: true,
  }).catch(() => {/* silent — tracking must never break the UI */});
}

const queryClient = new QueryClient();

function usePageTracking() {
  const [location] = useLocation();
  useEffect(() => { trackPageView(location); }, [location]);
}

function Router() {
  usePageTracking();
  return (
    // Single Suspense wraps all lazy routes — shows blank bg while chunk loads
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/about" component={AboutPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/faq" component={FAQPage} />
        <Route path="/lookup" component={LookupPage} />
        <Route path="/status" component={StatusPage} />
        <Route path="/exchange" component={ExchangePage} />
        <Route path="/earn-drop" component={EarnDropPage} />
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin" component={AdminDashboard} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  useIntegrations();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
