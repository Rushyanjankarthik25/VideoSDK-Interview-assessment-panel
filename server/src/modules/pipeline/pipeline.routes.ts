import express from "express";
import { getPipelineHealth } from "./pipeline.controller";

const router = express.Router();

router.get("/health", getPipelineHealth);

export default router;