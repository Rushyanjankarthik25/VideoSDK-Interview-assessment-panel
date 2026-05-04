import { Router } from "express";
import { ingestEvent } from "./event.controller";

const router = Router();

router.post("/ingest", ingestEvent);

export default router;