import { Router, type IRouter } from "express";
import healthRouter from "./health";
import faucetRouter from "./faucet";

const router: IRouter = Router();

router.use(healthRouter);
router.use(faucetRouter);

export default router;
