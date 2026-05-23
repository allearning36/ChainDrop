import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pagesTable } from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";

const router: IRouter = Router();

const DEFAULT_PAGES: Record<string, { title: string; content: string }> = {
  about: {
    title: "About ChainDrop",
    content: `# About ChainDrop

If you've ever tried to test a smart contract or experiment with a new blockchain, you know the struggle — getting testnet tokens is surprisingly annoying. Most faucets are slow, broken, or limited to a single network. We built ChainDrop to fix that.

ChainDrop is a multi-chain testnet faucet hub. You paste your wallet address, pick a network, and get tokens in seconds. No sign-up, no email, no KYC. Just free testnet crypto when you need it.

## Who is this for?

Mostly developers and people learning Web3. If you're building a DApp, testing a contract on Sepolia, exploring a new EVM chain, or just curious about how blockchain transactions work — ChainDrop is for you.

We also support mainnet faucets for certain smaller networks where tokens hold real value but are hard to come by through normal means.

## How it works

It's straightforward:

1. Go to the home page and find the network you need
2. Paste your wallet address
3. Hit "Request Funds" — tokens arrive within a minute

Each wallet address has a cooldown timer per network. This exists to keep things fair for everyone. Once your cooldown is up, you can claim again.

## What networks do we support?

We support dozens of EVM-compatible testnets and some non-EVM networks. Sepolia, Mumbai, and other popular testnets are always available. We regularly add new networks based on what the community is actually using.

You can check the **Status** page anytime to see which networks are live and how each one is doing.

## A small team, big ambitions

ChainDrop is maintained by a small team that genuinely cares about making Web3 development easier. We're not a big company — just people who got frustrated with existing faucets and decided to build something better.

If you have feedback, ideas, or run into issues, the **Support** button at the top of the page goes straight to us. We read everything.`,
  },
  contact: {
    title: "Contact Us",
    content: `# Contact Us

We're a small team and we try to stay accessible. Here's the best way to reach us depending on what you need.

## For quick help — use the Support chat

The fastest way to get in touch is through the **Support** button at the top of the page. It opens a live chat with our team. We typically respond within a few hours, sometimes faster.

This is the right channel for:
- Problems claiming tokens
- Questions about a specific network
- Reporting a bug or unexpected behavior
- General questions about how things work

## To report abuse or fraud

If you notice someone misusing the faucet — like draining funds unfairly or trying to bypass rate limits — please reach out through the support chat and let us know. We take these reports seriously and act quickly.

## For feedback and suggestions

We genuinely want to hear what you think. If a network we don't support would be useful to you, or if you have an idea for a feature, tell us. A lot of what's on ChainDrop today came from user requests.

## Community

We occasionally announce new network additions, maintenance windows, and other updates through the Announcement bar on the home page. Keep an eye on that if you want to stay in the loop.

We're working on expanding our community presence. For now, the support chat is the best place to find us.`,
  },
  privacy: {
    title: "Privacy Policy",
    content: `# Privacy Policy

*Last updated: May 2025*

We try to keep things simple. ChainDrop doesn't need much information from you to work, and we don't collect anything beyond what's necessary to run the service.

## What we collect

**Wallet addresses** — When you request tokens, your wallet address is stored so we can process the request and enforce the cooldown period. This is the only piece of information that's directly tied to your activity on the site.

**IP addresses** — We log IP addresses temporarily for rate limiting and abuse prevention. We don't use them to track you across sessions or tie them to your wallet address long-term.

**Support messages** — If you reach out through the support chat, we keep a record of the conversation so we can follow up and resolve your issue. This includes any contact details you choose to share.

**Usage data** — Like most websites, we collect basic analytics (page views, general traffic patterns). This data is anonymized and only used to understand how the site is performing.

## What we don't collect

We don't ask for your name, email address, or any personal information to use the faucet. No account, no registration.

## How we use what we collect

Wallet addresses and IP data are used to run the faucet fairly — processing requests, preventing abuse, and enforcing cooldowns. Support messages are used to help you. That's it.

We don't sell data. We don't share data with advertisers. We don't build profiles.

## Blockchain transactions

When we send tokens to your wallet, that transaction is recorded on the public blockchain. This is inherent to how blockchain works and is outside our control. Anyone can look up your wallet address on a block explorer and see the transaction.

## How long we keep data

Claim records are kept as long as necessary to run the service. Support conversations are kept for 90 days. IP rate-limiting data expires automatically.

## Your rights

If you want to know what data we hold about your wallet address, or you want it removed, contact us through the support chat. We'll handle it promptly.

## Changes to this policy

If we make significant changes to this policy, we'll post a notice on the site. The date at the top of this page reflects when it was last updated.`,
  },
  faq: {
    title: "Frequently Asked Questions",
    content: `# Frequently Asked Questions

## What exactly is ChainDrop?

ChainDrop is a faucet hub — a single place where you can get free testnet tokens across multiple blockchain networks. Testnet tokens let you build and test apps on a blockchain without spending real money. ChainDrop makes it easy to get those tokens quickly, without jumping between a dozen different faucet websites.

## Do I need to create an account?

No. Just paste your wallet address on the home page and request tokens. There's no sign-up, no email, no password.

## How do I claim tokens?

1. Go to the home page
2. Find the network you need (you can search or filter by testnet/mainnet)
3. Click on the network card and enter your wallet address
4. Hit "Request Funds" — tokens typically arrive within a minute

## Why is there a cooldown?

The cooldown exists so that one person can't drain the faucet for everyone else. Each wallet address can claim once per cooldown period, per network. The cooldown length varies by network and is shown on each card.

Once your cooldown is up, you can claim again. If you need more tokens before the cooldown expires, reach out via the Support button and we'll see what we can do.

## My claim failed — what happened?

A few common reasons:

- **Still in cooldown** — Check the timer on the network card to see when you can claim again
- **Invalid address** — Make sure you pasted the full wallet address and there are no extra spaces
- **Faucet wallet is low** — Our faucet wallets are refilled regularly, but they can run dry occasionally. Check the Status page or try again later
- **Network issues** — Sometimes the underlying blockchain RPC has problems. The Status page will usually reflect this

If none of these apply, use the Support button and we'll look into it.

## Are these tokens worth real money?

Testnet tokens have no monetary value — they exist purely for testing. You cannot sell them, transfer them to mainnet, or use them for anything financial.

Some mainnet tokens on smaller networks do have real (if small) value, but those are clearly labeled on the home page.

## Can I claim from multiple networks at once?

Yes. Each network has its own independent cooldown. You can claim from Sepolia, Mumbai, and any other network you need, all on the same day.

## How do I see my claim history?

Go to the **Lookup** page (linked in the footer), type in any wallet address, and you'll see the full claim history for that address across all networks on ChainDrop.

## My wallet address was blocked — is there a mistake?

If you believe your address was blocked unfairly, contact us through the Support button. Give us your wallet address and a brief explanation, and we'll review the case. Blocks are usually the result of automated abuse detection and we do occasionally get it wrong.

## Can I use ChainDrop for automated scripts or bots?

Not without permission. Automated claiming is against our fair use policy. If you have a legitimate need — like testing infrastructure that requires large amounts of tokens — reach out and let's talk. We'd rather work something out than block you.

## How often are new networks added?

We add new networks when there's genuine demand for them. If there's a network you need that we don't have, let us know through the support chat. It's genuinely the fastest way to get it added.`,
  },
  terms: {
    title: "Terms of Service",
    content: `# Terms of Service

*Last updated: May 2025*

By using ChainDrop, you agree to these terms. Please read them — they're not very long.

## What ChainDrop is

ChainDrop is a faucet service that distributes free testnet tokens and small amounts of certain mainnet tokens to help people develop and test blockchain applications. It is not a financial service, an exchange, or a wallet.

## What you're agreeing to

By using the site, you agree to the following:

**Use the service for legitimate purposes.** ChainDrop exists to help developers and learners. Using it to drain faucet wallets, harm other users, or do anything you know is wrong isn't allowed.

**Don't try to game the system.** Using bots, scripts, VPNs to rotate IPs, multiple wallets to bypass cooldowns, or any other method to claim more than your fair share is not allowed. We will block addresses and IP ranges when we detect this.

**You're responsible for what you do with the tokens.** We send tokens to the address you provide. What happens after that is on you.

**Testnet tokens have no monetary value.** We don't guarantee any token will be worth anything. Testnet tokens are explicitly worthless by design. Don't treat them otherwise.

## What we guarantee (and don't)

We run ChainDrop on a best-effort basis. We try to keep the service up and faucet wallets funded, but we can't promise 100% uptime or that a specific network will always be available. Faucet wallets can run dry, RPC nodes go down, and sometimes things break.

ChainDrop is provided "as is." We're not liable for losses, damages, or problems arising from your use of the service.

## Blocking and termination

We reserve the right to block wallet addresses or IP addresses at our discretion, especially in cases of abuse. If you think you've been blocked by mistake, contact us.

## Changes to these terms

We may update these terms from time to time. If we make material changes, we'll note it on the site. The date at the top of this page reflects the last update. Continued use of the service means you accept the current terms.

## Questions

If you have questions about these terms, reach out through the Support button. We're a small team and we'll get back to you.`,
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
