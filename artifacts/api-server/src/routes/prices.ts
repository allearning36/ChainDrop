import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/prices", async (req, res): Promise<void> => {
  const ids = req.query.ids as string;
  if (!ids) {
    res.status(400).json({ error: "ids query param required" });
    return;
  }

  try {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      res.status(502).json({ error: "Failed to fetch prices" });
      return;
    }

    const data = (await response.json()) as Array<{
      id: string;
      symbol: string;
      name: string;
      current_price: number;
      price_change_percentage_24h: number | null;
    }>;

    res.json(
      data.map((item) => ({
        id: item.id,
        symbol: item.symbol,
        name: item.name,
        current_price: item.current_price,
        price_change_percentage_24h: item.price_change_percentage_24h ?? null,
      }))
    );
  } catch (err) {
    logger.warn({ err }, "CoinGecko fetch failed");
    res.status(502).json({ error: "Price service unavailable" });
  }
});

export default router;
