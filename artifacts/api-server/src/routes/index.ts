import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chainsRouter from "./chains";
import faucetRouter from "./faucet";
import bannersRouter from "./banners";
import announcementsRouter from "./announcements";
import pricesRouter from "./prices";
import adminRouter from "./admin";
import uploadRouter from "./upload";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chainsRouter);
router.use(faucetRouter);
router.use(bannersRouter);
router.use(announcementsRouter);
router.use(pricesRouter);
router.use(adminRouter);
router.use(uploadRouter);

export default router;
