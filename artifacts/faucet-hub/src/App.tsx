import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import AboutPage from "@/pages/about";
import ContactPage from "@/pages/contact";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import FAQPage from "@/pages/faq";
import LookupPage from "@/pages/lookup";
import StatusPage from "@/pages/status";
import ExchangePage from "@/pages/exchange";
import AdminLogin from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";

import "@/lib/auth";

// ── Custom meta tags injection (from admin Site Verification settings) ────────
function useCustomMetaTags() {
  const injectedRef = useRef<HTMLElement[]>([]);
  useEffect(() => {
    fetch("/api/site-config/public")
      .then(r => r.ok ? r.json() : null)
      .then((d: { integrations?: { customMetaTags?: string } } | null) => {
        const raw = d?.integrations?.customMetaTags?.trim() ?? "";
        if (!raw) return;
        // Remove previously injected elements
        injectedRef.current.forEach(el => el.remove());
        injectedRef.current = [];
        // Parse and inject each tag individually
        const temp = document.createElement("div");
        temp.innerHTML = raw;
        Array.from(temp.children).forEach(child => {
          const tag = child.cloneNode(true) as HTMLElement;
          tag.setAttribute("data-chaindrop-custom", "1");
          document.head.appendChild(tag);
          injectedRef.current.push(tag);
        });
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
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useCustomMetaTags();
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
