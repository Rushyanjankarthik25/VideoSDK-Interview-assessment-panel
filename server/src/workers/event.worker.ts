import { Worker } from "bullmq";
import { ENV } from "../config/env";
import { Event } from "../modules/event/event.model";
import { Session, SessionDoc  } from "../modules/session/session.model";
import { handleMeetingEnded, handleMeetingStarted, handleParticipantJoined, handleSpeakerChanged } from "./handlers";
import { PipelineJob } from "../modules/pipeline/pipeline.model";
import { EventDoc } from "../modules/event/event.model";

const connection = {
  url: ENV.REDIS_URL,
};

export const eventWorker = new Worker(
  "event-queue",
  async (job) => {
    console.log("🔥 Worker picked job:", job.name);
    if (job.name !== "process-event") return;
    
    const { eventId } = job.data;

    const event = await Event.findById(eventId);
    if (!event) return;

    console.log("📌 Processing eventType:", event.eventType); // ✅ ADD THIS

    // ✅ idempotency check
    if (event.processedAt) {
      console.log("⚠️ Already processed:", eventId);
      return;
    }

    const session = await Session.findById(event.sessionId);
    if (!session) throw new Error("Session not found");

    const prevStatus = session.status;

    // ✅ fetch pipeline job record
    const jobRecord = await PipelineJob.findOne({
      sessionId: event.sessionId,
      jobType: "event.process",
    }).sort({ createdAt: -1 });

    try {
      // ✅ mark job as processing
      if (jobRecord) {
        jobRecord.status = "processing";
        jobRecord.attempts += 1;
        await jobRecord.save();
      }

      // 🔥 event handling
      switch (event.eventType) {
        case "participant-joined":
          await handleParticipantJoined(session as SessionDoc, event as EventDoc);
          break;

        case "meeting-started":
          await handleMeetingStarted(session as SessionDoc);
          break;

        case "meeting-ended":
          await handleMeetingEnded(session as SessionDoc);
          break;

        case "speaker-changed":
          await handleSpeakerChanged(session as SessionDoc, event as EventDoc);
          break;

        default:
          break;
      }

      // ✅ mark event processed
      event.processedAt = new Date();
      await event.save();

      // ✅ mark job completed
      if (jobRecord) {
        jobRecord.status = "completed";
        await jobRecord.save();
      }

      // ✅ observability log
      if (prevStatus !== session.status) {
        console.log({
          sessionId: session._id,
          fromStatus: prevStatus,
          toStatus: session.status,
          triggeredBy: event.eventType,
          timestamp: new Date().toISOString(),
        });
      }

    } catch (err: any) {
      console.error("❌ Worker error:", err);

      // ❌ pipeline failure handling (VERY IMPORTANT)
      if (jobRecord) {
        jobRecord.lastError = err.message;

        if (jobRecord.attempts >= 3) {
          jobRecord.status = "dead_letter";
        } else {
          jobRecord.status = "failed";
        }

        await jobRecord.save();
      }

      // ❌ session failure state
      session.status = "FAILED";
      session.failureReason = err.message ?? null;
      await session.save();

      throw err; // needed for retry
    }
  },
  { connection }
);

