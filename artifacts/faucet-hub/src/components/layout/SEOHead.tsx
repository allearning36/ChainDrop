import { useEffect } from "react";

interface SEOHeadProps {
  title?: string;
  description?: string;
  ogImage?: string;
}

const DEFAULT_TITLE = "ChainDrop — Multi-Chain Crypto Faucet Hub";
const DEFAULT_DESC = "Get free testnet crypto tokens from ChainDrop. Supports multiple EVM-compatible chains including Sepolia and more.";

function setMeta(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"], meta[property="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(name.startsWith("og:") ? "property" : "name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function injectScript(id: string, src: string, attrs: Record<string, string> = {}) {
  if (document.getElementById(id)) return;
  const s = document.createElement("script");
  s.id = id;
  s.src = src;
  s.async = true;
  Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
  document.head.appendChild(s);
}

function injectInlineScript(id: string, code: string) {
  if (document.getElementById(id)) return;
  const s = document.createElement("script");
  s.id = id;
  s.textContent = code;
  document.head.appendChild(s);
}

interface PublicConfig {
  seoTitle?: string;
  seoDescription?: string;
  seoOgImage?: string;
  integrations?: {
    googleAds?: { enabled: boolean; publisherId: string };
    googleAnalytics?: { enabled: boolean; measurementId: string };
    googleSearchConsole?: { verificationCode: string };
  };
}

export function SEOHead({ title, description, ogImage }: SEOHeadProps) {
  useEffect(() => {
    fetch("/api/site-config/public")
      .then(r => r.json() as Promise<PublicConfig>)
      .then(cfg => {
        const resolvedTitle = title ?? cfg.seoTitle ?? DEFAULT_TITLE;
        const resolvedDesc = description ?? cfg.seoDescription ?? DEFAULT_DESC;
        const resolvedOg = ogImage ?? cfg.seoOgImage ?? "";

        document.title = resolvedTitle;
        setMeta("description", resolvedDesc);
        setMeta("og:title", resolvedTitle);
        setMeta("og:description", resolvedDesc);
        if (resolvedOg) setMeta("og:image", resolvedOg);

        const integrations = cfg.integrations ?? {};

        // Google Search Console verification meta tag
        const gscCode = integrations.googleSearchConsole?.verificationCode ?? "";
        if (gscCode) setMeta("google-site-verification", gscCode);

        // Google Analytics 4
        const ga = integrations.googleAnalytics;
        if (ga?.enabled && ga.measurementId) {
          injectScript("ga4-script", `https://www.googletagmanager.com/gtag/js?id=${ga.measurementId}`);
          injectInlineScript("ga4-init", `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${ga.measurementId}');
          `);
        }

        // Google AdSense — inject loader script once
        const ads = integrations.googleAds;
        if (ads?.enabled && ads.publisherId) {
          injectScript(
            "adsense-script",
            `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ads.publisherId}`,
            { crossorigin: "anonymous" }
          );
        }
      })
      .catch(() => {
        document.title = title ?? DEFAULT_TITLE;
      });
  }, [title, description, ogImage]);

  return null;
}
