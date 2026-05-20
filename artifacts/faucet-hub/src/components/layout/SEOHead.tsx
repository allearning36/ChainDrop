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

/**
 * Updates document title + meta tags dynamically.
 * Uses site-wide defaults from /api/site-config/public when no props provided.
 */
export function SEOHead({ title, description, ogImage }: SEOHeadProps) {
  useEffect(() => {
    // Fetch global SEO settings, then apply overrides
    fetch("/api/site-config/public")
      .then(r => r.json() as Promise<{ seoTitle?: string; seoDescription?: string; seoOgImage?: string }>)
      .then(cfg => {
        const resolvedTitle = title ?? cfg.seoTitle ?? DEFAULT_TITLE;
        const resolvedDesc = description ?? cfg.seoDescription ?? DEFAULT_DESC;
        const resolvedOg = ogImage ?? cfg.seoOgImage ?? "";

        document.title = resolvedTitle;
        setMeta("description", resolvedDesc);
        setMeta("og:title", resolvedTitle);
        setMeta("og:description", resolvedDesc);
        if (resolvedOg) setMeta("og:image", resolvedOg);
      })
      .catch(() => {
        document.title = title ?? DEFAULT_TITLE;
      });
  }, [title, description, ogImage]);

  return null;
}
