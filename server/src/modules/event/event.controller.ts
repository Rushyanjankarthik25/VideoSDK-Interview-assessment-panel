import { Request, Response } from "express";
import { Event } from "./event.model";
import { eventQueue } from "../../queues/event.queue";
import { PipelineJob } from "../pipeline/pipeline.model";

export const ingestEvent = async (req: Request, res: Response) => {
  try {
    const existing = await Event.findOne({
      idempotencyKey: req.body.idempotencyKey,
    });

    if (existing) {
      return res.json({ message: "Duplicate event ignored" });
    }

    console.log("📥 Incoming event:", req.body.eventType);
    const event = await Event.create(req.body);

    // ✅ create pipeline job
    await PipelineJob.create({
      sessionId: event.sessionId,
      organizationId: event.organizationId,
      jobType: "event.process",
    });

    await eventQueue.add(
      "process-event",
      { eventId: event._id },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000, // 1s → 4s → 16s
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
    console.log("🚀 Job added to queue:", event._id);

    res.json({ success: true, eventId: event._id });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.json({ message: "Duplicate event ignored" });
    }

    res.status(500).json({ message: "Event ingestion failed" });
  }
};