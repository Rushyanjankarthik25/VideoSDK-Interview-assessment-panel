import { Queue } from "bullmq";
import { ENV } from "../config/env";

export const eventQueue = new Queue("event-queue", {
  connection: {
    url: ENV.REDIS_URL,
  },
});