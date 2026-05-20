import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pagesTable } from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";

const router: IRouter = Router();

const DEFAULT_PAGES: Record<string, { title: string; content: string }> = {
  about: {
    title: "About ChainDrop",
    content: `# About ChainDrop

ChainDrop is a multi-chain cryptocurrency faucet hub designed for developers, testers, and blockchain enthusiasts.

## Our Mission

We provide free testnet tokens to help developers build and test decentralized applications without the need to purchase real cryptocurrency.

## How It Works

1. Select a supported blockchain network
2. Enter your wallet address
3. Click "Request Funds" and receive tokens instantly

## Supported Networks

ChainDrop supports multiple EVM-compatible testnets including Sepolia, Mumbai, and more. New networks are added regularly.

## Why ChainDrop?

- Fast and reliable token distribution
- Multiple networks in one place
- No registration required
- 24-hour cooldown to ensure fair distribution`,
  },
  contact: {
    title: "Contact Us",
    content: `# Contact Us

Have questions or need support? We're here to help.

## Live Support Chat

Use the **Support** button in the top navigation to chat with our team directly. We typically respond within a few hours.

## Community

Join our community channels to stay updated on new features, network additions, and announcements.

## Report Abuse

If you encounter technical issues or want to report misuse of the faucet, please use the support chat. Our team will review and act promptly.

## Feedback

We love hearing from the community. Feature requests, bug reports, and general feedback are always welcome through the support chat.`,
  },
  privacy: {
    title: "Privacy Policy",
    content: `# Privacy Policy

Last updated: January 2025

## Information We Collect

ChainDrop collects minimal information necessary to provide our faucet service:

- **Wallet addresses** — Used to process token requests and enforce fair use policies
- **IP addresses** — Collected temporarily for rate limiting and abuse prevention
- **Support messages** — If you contact our support team, we store your name, email, and message content

## How We Use Your Information

- To process faucet requests and send tokens to your wallet
- To enforce cooldown periods and prevent abuse
- To respond to support inquiries
- To improve our service

## Data Retention

- Wallet addresses and claim records are retained for operational purposes
- Support conversations are retained for 90 days
- IP-based rate limiting data is cleared automatically

## Third-Party Services

ChainDrop uses public blockchain networks to process transactions. Transaction data is publicly visible on their respective block explorers.

## Your Rights

You may request deletion of any personally identifiable data we hold by contacting us through the support chat.

## Contact

If you have questions about this privacy policy, please contact us through our support chat.`,
  },
  faq: {
    title: "Frequently Asked Questions",
    content: `# Frequently Asked Questions

## What is ChainDrop?

ChainDrop is a multi-chain cryptocurrency faucet hub that provides free testnet tokens for developers, testers, and blockchain enthusiasts.

## How do I claim tokens?

1. Select a supported blockchain network from the home page
2. Enter your EVM wallet address
3. Click "Request Funds" — tokens will arrive in seconds

## Is there a cooldown period?

Yes. Each address has a cooldown period per chain to ensure fair distribution for all users. The cooldown varies by network and is displayed on each chain card.

## Why is my claim failing?

Common reasons:
- Your address is still in the cooldown period — check the claim button for the next available time
- The faucet wallet is temporarily low on funds
- You entered an invalid wallet address
- The chain is temporarily unavailable

## Are these tokens real money?

No. Testnet tokens have **no real monetary value**. They are provided solely for development and testing purposes on public test networks.

## Can I claim from multiple chains?

Yes! Each chain has its own independent cooldown, so you can claim from multiple networks simultaneously.

## What if I need more tokens?

Each address is limited to one claim per cooldown period per chain. If you require larger amounts, please contact us via the support chat.

## How do I check my claim history?

Use the **Lookup** page (linked in the footer) to enter any wallet address and view its full claim history across all chains.

## How do I report an issue?

Use the **Support** button in the navigation bar to chat with our team directly. We typically respond within a few hours.

## My wallet address was blocked — what do I do?

If you believe your address was blocked by mistake, contact us via the support chat with your wallet address and we will review your case promptly.`,
  },
  terms: {
    title: "Terms & Conditions",
    content: `# Terms & Conditions

Last updated: January 2025

## Acceptance of Terms

By using ChainDrop, you agree to these terms and conditions in full.

## Use of Service

ChainDrop provides testnet tokens for development and testing purposes only. By using our service, you agree to:

- Use tokens only for legitimate development and testing activities
- Not attempt to abuse or circumvent rate limiting mechanisms
- Not use automated scripts to claim tokens without prior permission
- Not use claimed tokens for any commercial or fraudulent purposes

## Token Value

Testnet tokens distributed by ChainDrop have **no real monetary value**. They are provided solely for testing purposes on public test networks.

## Fair Use

To ensure fair access for all users, we enforce a 24-hour cooldown per wallet address. Abuse of the service may result in permanent blocking of your wallet address.

## Service Availability

ChainDrop makes no guarantees about service uptime or token availability. Faucet wallets may run low on funds periodically and are replenished on a best-effort basis.

## Limitation of Liability

ChainDrop is provided "as is" without warranties of any kind. We are not liable for any damages arising from the use of our service.

## Changes to Terms

We reserve the right to modify these terms at any time. Continued use of the service constitutes acceptance of updated terms.

## Contact

For questions about these terms, please use our support chat.`,
  },
};

const SLUGS = ["about", "contact", "privacy", "terms", "faq"] as const;
type Slug = (typeof SLUGS)[number];

router.get("/pages/:slug", async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  if (!SLUGS.includes(slug as Slug)) {
    res.status(404).json({ error: "Page not found" });
    return;
  }
  const [row] = await db
    .select()
    .from(pagesTable)
    .where(eq(pagesTable.slug, slug))
    .limit(1);

  if (row) {
    res.json(row);
    return;
  }

  // Return default if no DB row yet
  const def = DEFAULT_PAGES[slug];
  res.json({ slug, title: def.title, content: def.content, updatedAt: null });
});

router.get("/admin/pages", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(pagesTable);
  // Merge defaults for any missing slugs
  const result = SLUGS.map((slug) => {
    const row = rows.find((r) => r.slug === slug);
    if (row) return row;
    const def = DEFAULT_PAGES[slug];
    return { slug, title: def.title, content: def.content, updatedAt: null };
  });
  res.json(result);
});

router.patch("/admin/pages/:slug", requireAdmin, async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  if (!SLUGS.includes(slug as Slug)) {
    res.status(404).json({ error: "Page not found" });
    return;
  }
  const { title, content } = req.body as { title: unknown; content: unknown };
  if (typeof title !== "string" || !title.trim() || title.length > 200) {
    res.status(400).json({ error: "Invalid title" });
    return;
  }
  if (typeof content !== "string" || !content.trim() || content.length > 100000) {
    res.status(400).json({ error: "Invalid content" });
    return;
  }
  await db
    .insert(pagesTable)
    .values({ slug, title, content })
    .onConflictDoUpdate({ target: pagesTable.slug, set: { title, content, updatedAt: new Date() } });

  res.json({ ok: true });
});

export default router;
