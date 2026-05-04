import { Request, Response } from "express";
import { eventQueue, transcriptionQueue, aiQueue } from "../../queues";
import { PipelineJob } from "./pipeline.model";

export const getPipelineHealth = async (req: Request, res: Response) => {
  try {
    // 🔥 1. Queue stats (ALL queues)
    const [
      eventStats,
      transcriptionStats,
      aiStats,
    ] = await Promise.all([
      eventQueue.getJobCounts(),
      transcriptionQueue.getJobCounts(),
      aiQueue.getJobCounts(),
    ]);

    // 🔥 2. Job stats from DB
    const jobs = await PipelineJob.find();

    const stats: Record<string, any> = {};

    for (const job of jobs) {
      const type = job.jobType;

      if (!stats[type]) {
        stats[type] = {
          total: 0,
          success: 0,
          failed: 0,
          totalTime: 0,
        };
      }

      stats[type].total += 1;

      if (job.status === "completed") stats[type].success += 1;

      if (job.status === "failed" || job.status === "dead_letter") {
        stats[type].failed += 1;
      }

      if (job.createdAt && job.updatedAt) {
        const duration =
          new Date(job.updatedAt).getTime() -
          new Date(job.createdAt).getTime();

        stats[type].totalTime += duration;
      }
    }

    // 🔥 Format metrics
    const formattedStats: Record<string, any> = {};

    for (const type in stats) {
      const s = stats[type];

      formattedStats[type] = {
        avgProcessingTime:
          s.total > 0 ? Math.round(s.totalTime / s.total) : 0,
        successRate: s.total > 0 ? s.success / s.total : 0,
        failureRate: s.total > 0 ? s.failed / s.total : 0,
      };
    }

    // 🔥 3. Dead letter queue info
    const deadJobs = await PipelineJob.find({
      status: "dead_letter",
    }).sort({ updatedAt: -1 });

    // 🔥 Final response
    res.json({
      queue: {
        event: eventStats,
        transcription: transcriptionStats,
        ai: aiStats,
      },
      jobs: formattedStats,
      deadLetter: {
        count: deadJobs.length,
        lastFailure: deadJobs[0]?.lastError || null,
      },
    });

  } catch (err) {
    console.error("❌ Pipeline health error:", err);
    res.status(500).json({ error: "Failed to fetch pipeline health" });
  }
};