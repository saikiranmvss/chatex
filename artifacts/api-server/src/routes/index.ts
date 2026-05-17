import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import conversationsRouter from "./conversations";
import messagesRouter from "./messages";
import groupsRouter from "./groups";
import channelsRouter from "./channels";
import notificationsRouter from "./notifications";
import adminRouter from "./admin";
import dashboardRouter from "./dashboard";
import uploadsRouter from "./uploads";

const router: IRouter = Router();

router.use(healthRouter);
router.use(uploadsRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(conversationsRouter);
router.use(messagesRouter);
router.use(groupsRouter);
router.use(channelsRouter);
router.use(notificationsRouter);
router.use(adminRouter);
router.use(dashboardRouter);

export default router;
