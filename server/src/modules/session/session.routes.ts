import { Router } from "express";
import {
  createSession,
  getSessionById,
  updateStatus,
  refreshToken,
  getSessions
} from "./session.controller";

const router = Router();

router.post("/", createSession);
router.get("/", getSessions);
router.get("/:sessionId", getSessionById);
router.patch("/:sessionId/status", updateStatus);
router.post("/:sessionId/token/refresh", refreshToken);

export default router;