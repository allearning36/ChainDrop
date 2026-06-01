import { Router, type IRouter } from "express";
import { eq, and, desc, count as drizzleCount, sql } from "drizzle-orm";
import {
  db, chainsTable,
  earnDropCampaignsTable, earnDropTasksTable, earnDropPromoCodesTable, earnDropParticipantsTable,
  earnDropJoinsTable,
} from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";
import { sendTokens, isValidAddress, type ChainType } from "../lib/chains/index";
import { parseRpcUrls } from "../lib/rpcFailover";
import { resolveChainPrivateKey } from "../lib/encryption";

const router: IRouter = Router();

// ── Captcha ───────────────────────────────────────────────────────────────────

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY ?? "";

async function verifyCaptcha(token: string): Promise<boolean> {
  if (!RECAPTCHA_SECRET) return true; // dev mode — skip
  try {
    const r = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET}&response=${encodeURIComponent(token)}`,
      { method: "POST" },
    );
    const d = await r.json() as { success: boolean };
    return d.success;
  } catch { return false; }
}

// ── Extract client IP ─────────────────────────────────────────────────────────

function getClientIp(req: import("express").Request): string {
  const fwd = req.headers["x-forwarded-for"];
  return (typeof fwd === "string" ? fwd.split(",")[0] : Array.isArray(fwd) ? fwd[0] : req.ip ?? "unknown")
    .trim().replace(/^::ffff:/, "");
}

// ── helpers ──────────────────────────────────────────────────────────────────

function now() { return new Date(); }

async function getParticipantCount(campaignId: number): Promise<number> {
  const [row] = await db
    .select({ cnt: drizzleCount() })
    .from(earnDropJoinsTable)
    .where(eq(earnDropJoinsTable.campaignId, campaignId));
  return Number(row?.cnt ?? 0);
}

// ── Public: list active campaigns ────────────────────────────────────────────

router.get("/earn-drop/campaigns", async (_req, res): Promise<void> => {
  const campaigns = await db
    .select()
    .from(earnDropCampaignsTable)
    .where(and(
      eq(earnDropCampaignsTable.isActive, true),
      sql`${earnDropCampaignsTable.endDate} > NOW()`,
    ))
    .orderBy(desc(earnDropCampaignsTable.createdAt));

  const results = await Promise.all(campaigns.map(async c => {
    const [chain] = await db.select({ explorerUrl: chainsTable.explorerUrl })
      .from(chainsTable).where(eq(chainsTable.id, c.chainId)).limit(1);
    return {
      id: c.id,
      title: c.title,
      logoUrl: c.logoUrl,
      rewardAmount: c.rewardAmount,
      rewardToken: c.rewardToken,
      chainId: c.chainId,
      endDate: c.endDate.toISOString(),
      promoCodeEnabled: c.promoCodeEnabled,
      promoScheduleEnabled: c.promoScheduleEnabled,
      promoScheduleAt: c.promoScheduleAt?.toISOString() ?? null,
      twitterUrl: c.twitterUrl,
      telegramUrl: c.telegramUrl,
      discordUrl: c.discordUrl,
      websiteUrl: c.websiteUrl,
      explorerUrl: chain?.explorerUrl ?? null,
      totalParticipants: await getParticipantCount(c.id),
    };
  }));

  res.json(results);
});

// ── Public: campaign detail with tasks ───────────────────────────────────────

router.get("/earn-drop/campaigns/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [campaign] = await db.select().from(earnDropCampaignsTable)
    .where(eq(earnDropCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found" }); return; }

  const tasks = await db.select().from(earnDropTasksTable)
    .where(eq(earnDropTasksTable.campaignId, id))
    .orderBy(earnDropTasksTable.stepNumber);

  const [chain] = await db.select({ explorerUrl: chainsTable.explorerUrl })
    .from(chainsTable).where(eq(chainsTable.id, campaign.chainId)).limit(1);

  res.json({
    id: campaign.id,
    title: campaign.title,
    logoUrl: campaign.logoUrl,
    rewardAmount: campaign.rewardAmount,
    rewardToken: campaign.rewardToken,
    chainId: campaign.chainId,
    endDate: campaign.endDate.toISOString(),
    rules: campaign.rules,
    promoCodeEnabled: campaign.promoCodeEnabled,
    promoScheduleEnabled: campaign.promoScheduleEnabled,
    promoScheduleAt: campaign.promoScheduleAt?.toISOString() ?? null,
    twitterUrl: campaign.twitterUrl,
    telegramUrl: campaign.telegramUrl,
    discordUrl: campaign.discordUrl,
    websiteUrl: campaign.websiteUrl,
    explorerUrl: chain?.explorerUrl ?? null,
    totalParticipants: await getParticipantCount(campaign.id),
    tasks: tasks.map(t => ({
      id: t.id,
      stepNumber: t.stepNumber,
      title: t.title,
      description: t.description,
      logoUrl: t.logoUrl,
      actionType: t.actionType,
      actionUrl: t.actionUrl,
      actionLabel: t.actionLabel,
    })),
  });
});

// ── Public: anonymous join (first task done — no address needed) ──────────────

router.post("/earn-drop/campaigns/:id/join", async (req, res): Promise<void> => {
  const campaignId = parseInt(req.params.id as string);
  const sessionId = (req.body.sessionId as string | undefined)?.trim();
  if (isNaN(campaignId) || !sessionId || sessionId.length < 8) {
    res.json({ ok: true }); return;
  }
  try {
    await db.insert(earnDropJoinsTable)
      .values({ campaignId, sessionId })
      .onConflictDoNothing();
  } catch { /* ignore — duplicate silently */ }
  res.json({ ok: true });
});

// ── Public: get user progress ─────────────────────────────────────────────────

router.get("/earn-drop/campaigns/:id/progress", async (req, res): Promise<void> => {
  const campaignId = parseInt(req.params.id as string);
  const address = (req.query.address as string)?.toLowerCase().trim();
  if (isNaN(campaignId) || !address) { res.status(400).json({ error: "Invalid params" }); return; }

  const [participant] = await db.select().from(earnDropParticipantsTable)
    .where(and(
      eq(earnDropParticipantsTable.campaignId, campaignId),
      eq(earnDropParticipantsTable.address, address),
    )).limit(1);

  res.json({
    campaignId,
    address,
    completedSteps: participant?.completedSteps ?? [],
    claimed: participant?.status === "claimed",
    status: participant?.status ?? "pending",
    txHash: participant?.txHash ?? null,
  });
});

// ── Public: mark task complete ────────────────────────────────────────────────

router.post("/earn-drop/campaigns/:id/complete-task", async (req, res): Promise<void> => {
  const campaignId = parseInt(req.params.id as string);
  const address = (req.body.address as string)?.toLowerCase().trim();
  const stepNumber = parseInt(req.body.stepNumber);

  if (isNaN(campaignId) || !address || isNaN(stepNumber)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const [campaign] = await db.select().from(earnDropCampaignsTable)
    .where(eq(earnDropCampaignsTable.id, campaignId)).limit(1);
  if (!campaign || !campaign.isActive || campaign.endDate < now()) {
    res.status(400).json({ error: "Campaign not found or ended" }); return;
  }

  const [existing] = await db.select().from(earnDropParticipantsTable)
    .where(and(
      eq(earnDropParticipantsTable.campaignId, campaignId),
      eq(earnDropParticipantsTable.address, address),
    )).limit(1);

  if (existing) {
    if (existing.status === "claimed") {
      res.json({ campaignId, address, completedSteps: existing.completedSteps, claimed: true, status: "claimed", txHash: existing.txHash });
      return;
    }
    const steps = existing.completedSteps.includes(stepNumber)
      ? existing.completedSteps
      : [...existing.completedSteps, stepNumber];
    await db.update(earnDropParticipantsTable)
      .set({ completedSteps: steps })
      .where(eq(earnDropParticipantsTable.id, existing.id));
    res.json({ campaignId, address, completedSteps: steps, claimed: false, status: existing.status, txHash: null });
  } else {
    await db.insert(earnDropParticipantsTable).values({
      campaignId, address, completedSteps: [stepNumber], status: "pending",
    });
    res.json({ campaignId, address, completedSteps: [stepNumber], claimed: false, status: "pending", txHash: null });
  }
});

// ── Public: claim reward ──────────────────────────────────────────────────────

router.post("/earn-drop/claim", async (req, res): Promise<void> => {
  const campaignId = parseInt(req.body.campaignId);
  const address = (req.body.address as string)?.toLowerCase().trim();
  const promoCode = (req.body.promoCode as string | undefined)?.trim();
  const captchaToken = (req.body.captchaToken as string | undefined) ?? "";

  if (isNaN(campaignId) || !address) {
    res.status(400).json({ error: "Invalid params" }); return;
  }

  // reCAPTCHA verification
  const captchaOk = await verifyCaptcha(captchaToken);
  if (!captchaOk) { res.status(400).json({ error: "CAPTCHA verification failed" }); return; }

  const [campaign] = await db.select().from(earnDropCampaignsTable)
    .where(eq(earnDropCampaignsTable.id, campaignId)).limit(1);
  if (!campaign) { res.status(400).json({ error: "Campaign not found" }); return; }
  if (!campaign.isActive || campaign.endDate < now()) {
    res.status(400).json({ error: "Campaign has ended" }); return;
  }

  // Promo schedule: not claimable yet
  if (campaign.promoScheduleEnabled && campaign.promoScheduleAt && campaign.promoScheduleAt > now()) {
    res.status(400).json({ error: "Drop not yet claimable — schedule pending" }); return;
  }

  const chain = await db.select().from(chainsTable)
    .where(eq(chainsTable.id, campaign.chainId)).limit(1).then(r => r[0]);
  if (!chain || !chain.isEnabled) {
    res.status(400).json({ error: "Chain not available" }); return;
  }

  const validAddr = await isValidAddress(chain.chainType as ChainType, address, chain.addressRegex);
  if (!validAddr) { res.status(400).json({ error: "Invalid wallet address" }); return; }

  // IP-based duplicate check
  const clientIp = getClientIp(req);
  if (clientIp && clientIp !== "unknown") {
    const [ipClaim] = await db.select({ id: earnDropParticipantsTable.id })
      .from(earnDropParticipantsTable)
      .where(and(
        eq(earnDropParticipantsTable.campaignId, campaignId),
        eq(earnDropParticipantsTable.claimedFromIp, clientIp),
        eq(earnDropParticipantsTable.status, "claimed"),
      )).limit(1);
    if (ipClaim) {
      res.status(400).json({ error: "This drop has already been claimed from your network" }); return;
    }
  }

  const tasks = await db.select().from(earnDropTasksTable)
    .where(eq(earnDropTasksTable.campaignId, campaignId));

  const [participant] = await db.select().from(earnDropParticipantsTable)
    .where(and(
      eq(earnDropParticipantsTable.campaignId, campaignId),
      eq(earnDropParticipantsTable.address, address),
    )).limit(1);

  if (participant?.status === "claimed") {
    res.status(400).json({ error: "Already claimed" }); return;
  }

  const completedSteps = participant?.completedSteps ?? [];
  const allTaskNums = tasks.map(t => t.stepNumber);
  const notDone = allTaskNums.filter(n => !completedSteps.includes(n));
  if (notDone.length > 0) {
    res.status(400).json({ error: "Complete all tasks before claiming" }); return;
  }

  if (campaign.promoCodeEnabled) {
    if (!promoCode) { res.status(400).json({ error: "Promo code required" }); return; }
    const [codeRow] = await db.select().from(earnDropPromoCodesTable)
      .where(and(
        eq(earnDropPromoCodesTable.campaignId, campaignId),
        eq(earnDropPromoCodesTable.code, promoCode.toUpperCase()),
        eq(earnDropPromoCodesTable.isActive, true),
      )).limit(1);
    if (!codeRow) { res.status(400).json({ error: "Invalid promo code" }); return; }
    if (codeRow.maxUses > 0 && codeRow.usedCount >= codeRow.maxUses) {
      res.status(400).json({ error: "Promo code usage limit reached" }); return;
    }
    await db.update(earnDropPromoCodesTable)
      .set({ usedCount: codeRow.usedCount + 1 })
      .where(eq(earnDropPromoCodesTable.id, codeRow.id));
  }

  const privateKey = resolveChainPrivateKey(chain.privateKey);
  if (!privateKey) { res.status(500).json({ error: "Chain wallet not configured" }); return; }

  const rpcUrls = parseRpcUrls(chain.rpcUrls, chain.rpcUrl);
  const { txHash } = await sendTokens(
    chain.chainType as ChainType,
    rpcUrls,
    privateKey,
    address,
    campaign.rewardAmount,
    { gasPriceGwei: chain.gasPriceGwei, gasLimit: chain.gasLimit },
  );

  if (participant) {
    await db.update(earnDropParticipantsTable)
      .set({ status: "claimed", txHash, claimedAt: new Date(), promoCode: promoCode ?? null, claimedFromIp: clientIp })
      .where(eq(earnDropParticipantsTable.id, participant.id));
  } else {
    await db.insert(earnDropParticipantsTable).values({
      campaignId, address, completedSteps: allTaskNums,
      promoCode: promoCode ?? null, status: "claimed", txHash, claimedAt: new Date(), claimedFromIp: clientIp,
    });
  }

  res.json({ txHash, rewardAmount: campaign.rewardAmount, rewardToken: campaign.rewardToken });
});

// ── Admin: list all campaigns ─────────────────────────────────────────────────

router.get("/admin/earn-drop/campaigns", requireAdmin, async (_req, res): Promise<void> => {
  const campaigns = await db.select().from(earnDropCampaignsTable)
    .orderBy(desc(earnDropCampaignsTable.createdAt));
  const results = await Promise.all(campaigns.map(async c => ({
    ...c,
    rewardAmount: c.rewardAmount,
    endDate: c.endDate.toISOString(),
    createdAt: c.createdAt.toISOString(),
    totalParticipants: await getParticipantCount(c.id),
  })));
  res.json(results);
});

// ── Admin: create campaign ────────────────────────────────────────────────────

router.post("/admin/earn-drop/campaigns", requireAdmin, async (req, res): Promise<void> => {
  const { title, logoUrl, rewardAmount, rewardToken, chainId, endDate, rules,
          twitterUrl, telegramUrl, discordUrl, websiteUrl,
          promoCodeEnabled, promoScheduleEnabled, promoScheduleAt, isActive } = req.body as {
    title: string; logoUrl?: string; rewardAmount: string; rewardToken: string;
    chainId: number; endDate: string; rules?: string;
    twitterUrl?: string; telegramUrl?: string; discordUrl?: string; websiteUrl?: string;
    promoCodeEnabled?: boolean; promoScheduleEnabled?: boolean; promoScheduleAt?: string | null;
    isActive?: boolean;
  };
  if (!title || !rewardAmount || !rewardToken || !chainId || !endDate) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }
  const [created] = await db.insert(earnDropCampaignsTable).values({
    title, logoUrl: logoUrl ?? "", rewardAmount, rewardToken,
    chainId: Number(chainId), endDate: new Date(endDate),
    rules: rules ?? "",
    twitterUrl: twitterUrl ?? "", telegramUrl: telegramUrl ?? "",
    discordUrl: discordUrl ?? "", websiteUrl: websiteUrl ?? "",
    promoCodeEnabled: promoCodeEnabled ?? false,
    promoScheduleEnabled: promoScheduleEnabled ?? false,
    promoScheduleAt: promoScheduleAt ? new Date(promoScheduleAt) : null,
    isActive: isActive !== undefined ? isActive : true,
  }).returning();
  res.status(201).json({ ...created!, endDate: created!.endDate.toISOString(), createdAt: created!.createdAt.toISOString(), totalParticipants: 0 });
});

// ── Admin: update campaign ────────────────────────────────────────────────────

router.put("/admin/earn-drop/campaigns/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { title, logoUrl, rewardAmount, rewardToken, chainId, endDate, rules,
          twitterUrl, telegramUrl, discordUrl, websiteUrl,
          promoCodeEnabled, promoScheduleEnabled, promoScheduleAt, isActive } = req.body as {
    title?: string; logoUrl?: string; rewardAmount?: string; rewardToken?: string;
    chainId?: number; endDate?: string; rules?: string;
    twitterUrl?: string; telegramUrl?: string; discordUrl?: string; websiteUrl?: string;
    promoCodeEnabled?: boolean; promoScheduleEnabled?: boolean; promoScheduleAt?: string | null;
    isActive?: boolean;
  };
  const patch: Record<string, unknown> = {};
  if (title !== undefined) patch.title = title;
  if (logoUrl !== undefined) patch.logoUrl = logoUrl;
  if (rewardAmount !== undefined) patch.rewardAmount = rewardAmount;
  if (rewardToken !== undefined) patch.rewardToken = rewardToken;
  if (chainId !== undefined) patch.chainId = Number(chainId);
  if (endDate !== undefined) patch.endDate = new Date(endDate);
  if (rules !== undefined) patch.rules = rules;
  if (twitterUrl !== undefined) patch.twitterUrl = twitterUrl;
  if (telegramUrl !== undefined) patch.telegramUrl = telegramUrl;
  if (discordUrl !== undefined) patch.discordUrl = discordUrl;
  if (websiteUrl !== undefined) patch.websiteUrl = websiteUrl;
  if (promoCodeEnabled !== undefined) patch.promoCodeEnabled = promoCodeEnabled;
  if (promoScheduleEnabled !== undefined) patch.promoScheduleEnabled = promoScheduleEnabled;
  if (promoScheduleAt !== undefined) patch.promoScheduleAt = promoScheduleAt ? new Date(promoScheduleAt) : null;
  if (isActive !== undefined) patch.isActive = isActive;

  const [updated] = await db.update(earnDropCampaignsTable).set(patch).where(eq(earnDropCampaignsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...updated, endDate: updated.endDate.toISOString(), createdAt: updated.createdAt.toISOString(), totalParticipants: await getParticipantCount(id) });
});

// ── Admin: delete campaign ────────────────────────────────────────────────────

router.delete("/admin/earn-drop/campaigns/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(earnDropTasksTable).where(eq(earnDropTasksTable.campaignId, id));
  await db.delete(earnDropPromoCodesTable).where(eq(earnDropPromoCodesTable.campaignId, id));
  await db.delete(earnDropParticipantsTable).where(eq(earnDropParticipantsTable.campaignId, id));
  await db.delete(earnDropCampaignsTable).where(eq(earnDropCampaignsTable.id, id));
  res.json({ success: true });
});

// ── Admin: tasks ──────────────────────────────────────────────────────────────

router.get("/admin/earn-drop/campaigns/:id/tasks", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const tasks = await db.select().from(earnDropTasksTable)
    .where(eq(earnDropTasksTable.campaignId, id))
    .orderBy(earnDropTasksTable.stepNumber);
  res.json(tasks.map(t => ({ ...t, createdAt: undefined })));
});

router.post("/admin/earn-drop/campaigns/:id/tasks", requireAdmin, async (req, res): Promise<void> => {
  const campaignId = parseInt(req.params.id as string);
  if (isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { stepNumber, title, description, logoUrl, actionType, actionUrl, actionLabel } = req.body as {
    stepNumber: number; title: string; description?: string; logoUrl?: string;
    actionType?: string; actionUrl?: string; actionLabel?: string;
  };
  if (!title || !stepNumber) { res.status(400).json({ error: "Missing required fields" }); return; }
  const [created] = await db.insert(earnDropTasksTable).values({
    campaignId, stepNumber: Number(stepNumber), title,
    description: description ?? "", logoUrl: logoUrl ?? "",
    actionType: actionType ?? "link", actionUrl: actionUrl ?? "",
    actionLabel: actionLabel ?? "Go",
  }).returning();
  res.status(201).json({ ...created!, createdAt: undefined });
});

router.put("/admin/earn-drop/tasks/:taskId", requireAdmin, async (req, res): Promise<void> => {
  const taskId = parseInt(req.params.taskId as string);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { stepNumber, title, description, logoUrl, actionType, actionUrl, actionLabel } = req.body as {
    stepNumber?: number; title?: string; description?: string; logoUrl?: string;
    actionType?: string; actionUrl?: string; actionLabel?: string;
  };
  const patch: Record<string, unknown> = {};
  if (stepNumber !== undefined) patch.stepNumber = Number(stepNumber);
  if (title !== undefined) patch.title = title;
  if (description !== undefined) patch.description = description;
  if (logoUrl !== undefined) patch.logoUrl = logoUrl;
  if (actionType !== undefined) patch.actionType = actionType;
  if (actionUrl !== undefined) patch.actionUrl = actionUrl;
  if (actionLabel !== undefined) patch.actionLabel = actionLabel;
  const [updated] = await db.update(earnDropTasksTable).set(patch).where(eq(earnDropTasksTable.id, taskId)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...updated, createdAt: undefined });
});

router.delete("/admin/earn-drop/tasks/:taskId", requireAdmin, async (req, res): Promise<void> => {
  const taskId = parseInt(req.params.taskId as string);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(earnDropTasksTable).where(eq(earnDropTasksTable.id, taskId));
  res.json({ success: true });
});

// ── Admin: promo codes ────────────────────────────────────────────────────────

router.get("/admin/earn-drop/campaigns/:id/promo-codes", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const codes = await db.select().from(earnDropPromoCodesTable)
    .where(eq(earnDropPromoCodesTable.campaignId, id))
    .orderBy(desc(earnDropPromoCodesTable.createdAt));
  res.json(codes.map(c => ({ ...c, createdAt: c.createdAt.toISOString() })));
});

router.post("/admin/earn-drop/campaigns/:id/promo-codes", requireAdmin, async (req, res): Promise<void> => {
  const campaignId = parseInt(req.params.id as string);
  if (isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { code, maxUses } = req.body as { code: string; maxUses?: number };
  if (!code) { res.status(400).json({ error: "Code required" }); return; }
  const [created] = await db.insert(earnDropPromoCodesTable).values({
    campaignId, code: code.trim().toUpperCase(), maxUses: maxUses ?? 0,
  }).returning();
  res.status(201).json({ ...created!, createdAt: created!.createdAt.toISOString() });
});

router.delete("/admin/earn-drop/promo-codes/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(earnDropPromoCodesTable).where(eq(earnDropPromoCodesTable.id, id));
  res.json({ success: true });
});

// ── Admin: participants ───────────────────────────────────────────────────────

router.get("/admin/earn-drop/campaigns/:id/participants", requireAdmin, async (req, res): Promise<void> => {
  const campaignId = parseInt(req.params.id as string);
  if (isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? "50")));
  const offset = (page - 1) * limit;

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(earnDropParticipantsTable)
      .where(eq(earnDropParticipantsTable.campaignId, campaignId))
      .orderBy(desc(earnDropParticipantsTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ total: drizzleCount() }).from(earnDropParticipantsTable)
      .where(eq(earnDropParticipantsTable.campaignId, campaignId)),
  ]);

  res.json({
    participants: rows.map(r => ({
      ...r,
      claimedAt: r.claimedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total: Number(total),
    page,
    limit,
    pages: Math.ceil(Number(total) / limit),
  });
});

export default router;
