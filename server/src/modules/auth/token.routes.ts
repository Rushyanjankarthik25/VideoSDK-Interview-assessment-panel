import { Router } from "express";
import { getVideoToken } from "./token.controller";

const router = Router();

router.get("/token", getVideoToken);

export default router;