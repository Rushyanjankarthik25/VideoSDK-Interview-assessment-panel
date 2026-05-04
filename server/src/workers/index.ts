import { connectDB } from "../config/db";
import { eventWorker } from "./event.worker";
import { transcriptionWorker } from "./transcription.worker";
import { aiWorker } from "./ai.worker";

async function startWorker() {
  try {
    // 🔥 REQUIRED — connect DB first
    await connectDB();
    console.log("✅ MongoDB connected (worker)");

    console.log("🧠 Worker started...");

    // 🔥 keep process alive
    process.stdin.resume();

    // Debug logs
    eventWorker.on("ready", () => {
      console.log("✅ Worker connected to Redis");
    });

    eventWorker.on("active", (job) => {
      console.log("⚡ Processing job:", job.name);
    });

    eventWorker.on("completed", (job) => {
      console.log("✅ Job completed:", job.name);
    });

    eventWorker.on("failed", (job, err) => {
      console.error("❌ Job failed:", job?.name, err.message);
    });

    transcriptionWorker.on("ready", () => console.log("Transcription worker ready"));

    transcriptionWorker.on("failed", (job, err) => {
      console.error("❌ Job failed:", job?.name, err.message);
    });
    
    aiWorker.on("ready", () => console.log("AI worker ready"));

    aiWorker.on("failed", (job, err) => {
      console.error("❌ Job failed:", job?.name, err.message);
    });

  } catch (err) {
    console.error("❌ Worker startup failed:", err);
    process.exit(1);
  }
}

startWorker();