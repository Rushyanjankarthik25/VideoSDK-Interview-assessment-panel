import express from "express";
import cors from "cors";
import sessionRoutes from "./modules/session/session.routes";
import eventRoutes from "./modules/event/event.routes";
import tokenRoutes from "./modules/auth/token.routes";
import pipelineRoutes from "./modules/pipeline/pipeline.routes";
import { generateApiToken } from "./utils/generateVideoSDKToken";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/sessions", sessionRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/auth", tokenRoutes);
app.use("/api/pipeline", pipelineRoutes);
// app.get("/debug/api-token", (req, res) => {
//   res.json({ token: generateApiToken() });
// });

export default app;