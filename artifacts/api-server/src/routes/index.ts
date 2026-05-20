import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chainsRouter from "./chains";
import faucetRouter from "./faucet";
import buyRouter from "./buy";
import bannersRouter from "./banners";
import announcementsRouter from "./announcements";
import pricesRouter from "./prices";
import adminRouter from "./admin";
import uploadRouter from "./upload";
import supportRouter from "./support";
import settingsRouter from "./settings";
import adminToolsRouter from "./adminTools";
import pagesRouter from "./pages";
import siteConfigRouter from "./siteConfig";
import lookupRouter from "./lookup";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chainsRouter);
router.use(faucetRouter);
router.use(buyRouter);
router.use(bannersRouter);
router.use(announcementsRouter);
router.use(pricesRouter);
router.use(adminRouter);
router.use(uploadRouter);
router.use(supportRouter);
router.use(settingsRouter);
router.use(adminToolsRouter);
router.use(pagesRouter);
router.use(siteConfigRouter);
router.use(lookupRouter);

export default router;
