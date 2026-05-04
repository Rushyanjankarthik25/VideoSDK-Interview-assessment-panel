import { Queue } from "bullmq";
import { ENV } from "../config/env";

const connection = {
  url: ENV.REDIS_URL,
};

// ✅ Separate queues
export const eventQueue = new Queue("event-queue", { connection });

export const transcriptionQueue = new Queue("transcription-queue", {
  connection,
});

export const aiQueue = new Queue("ai-queue", {
  connection,
});