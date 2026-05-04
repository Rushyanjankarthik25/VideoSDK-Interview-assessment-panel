import { Worker } from "bullmq";
import { ENV } from "../config/env";
import { PipelineJob } from "../modules/pipeline/pipeline.model";
import { Transcript } from "../modules/transcript/transcript.model";
import { Session } from "../modules/session/session.model";
import { Event } from "../modules/event/event.model";
import { aiQueue } from "../queues";
import { TranscriptSegment } from "../types/transcript.types";
import { generateApiToken } from "../utils/generateVideoSDKToken";
import { GoogleGenerativeAI } from "@google/generative-ai"; 
import axios from "axios";
import fs from "fs";
import path from "path";
import os from "os";

type Recording = {
  createdAt: string;
  file?: { fileUrl?: string };
};

const genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
const connection = { url: ENV.REDIS_URL };



// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch the VideoSDK recording for a session.
 * Returns the download URL of the most recent mp4 recording, or null.
 */
async function fetchRecordingUrl(roomId: string): Promise<string | null> {
  try {
    const token = generateApiToken();
    const res = await axios.get(
      `https://api.videosdk.live/v2/recordings?roomId=${roomId}`,
      { headers: { Authorization: token } }
    );
    const recordings = (res.data?.data ?? []) as Recording[];
    if (!recordings.length) return null;
    // Most recent first
    recordings.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return recordings[0]?.file?.fileUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Transcription via Gemini (simulated for demo).
 *
 * Architecture note (for Loom + README):
 * In production this would be replaced with:
 *   1. Download recording mp4 from recordingUrl
 *   2. Send to OpenAI Whisper (audio.transcriptions.create, verbose_json)
 *   3. Map Whisper segments → TranscriptSegment[]
 *   4. Use a diarisation service (AssemblyAI / Pyannote) to assign speaker roles
 *
 * For this assessment we use Gemini to generate realistic transcript data
 * so the full pipeline (transcription → AI scoring → report) can be demonstrated
 * end-to-end without requiring a Whisper API call on a downloaded recording.
 */
async function transcribeWithGemini(): Promise<{
  segments: TranscriptSegment[];
  isPartial: boolean;
}> {

  const prompt = `
Simulate an interview transcription.

Return STRICT JSON:

[
  {
    "speaker": {
      "participantId": "cand_1",
      "name": "Candidate",
      "role": "candidate"
    },
    "startTime": 0,
    "endTime": 5,
    "text": "I have worked with React and Node.js extensively.",
    "confidence": 0.95
  },
  {
    "speaker": {
      "participantId": "int_1",
      "name": "Interviewer",
      "role": "interviewer"
    },
    "startTime": 6,
    "endTime": 10,
    "text": "Explain your backend experience.",
    "confidence": 0.92
  }
]
`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text();

  if (!raw) throw new Error("Empty Gemini response");

  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Invalid JSON");

  const segments = JSON.parse(jsonMatch[0]) as TranscriptSegment[];

  return {
    segments,
    isPartial: false
  };
}

/**
 * Derive meeting duration in seconds from meeting-started / meeting-ended events.
 */
async function getMeetingDuration(sessionId: string): Promise<number> {
  const [started, ended] = await Promise.all([
    Event.findOne({ sessionId, eventType: "meeting-started" }).sort({ createdAt: 1 }),
    Event.findOne({ sessionId, eventType: "meeting-ended" }).sort({ createdAt: -1 }),
  ]);
  if (!started || !ended) return 0;
  const startTs =
  "timestamp" in started
    ? Number((started as unknown as { timestamp: number }).timestamp)
    : started.createdAt.getTime();

  const endTs =
    "timestamp" in ended
      ? Number((ended as unknown as { timestamp: number }).timestamp)
      : ended.createdAt.getTime();

  return Math.max(0, Math.round((endTs - startTs) / 1000));
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const transcriptionWorker = new Worker(
  "transcription-queue",
  async (job) => {
    const { sessionId, organizationId } = job.data;
    console.log("🧠 Transcription started:", sessionId);

    const session = await Session.findById(sessionId);
    if (!session) throw new Error("Session not found");

    // if (job.attemptsMade === 0) {
    //   console.log("💥 Simulated failure (first attempt)");
    //   throw new Error("Simulated transcription failure");
    // }

    // ✅ Upsert pattern: if BullMQ retries the job, we update the existing
    // transcript doc instead of creating a duplicate.
    const jobRecord = await PipelineJob.findOne({
      sessionId,
      jobType: "transcription.process",
    }).sort({ createdAt: -1 });

    // ✅ Mark transcript as processing via upsert (idempotent)
    let transcript = await Transcript.findOneAndUpdate(
      { sessionId },
      {
        $setOnInsert: {
          sessionId,
          organizationId,
          segments: [],
          metadata: {},
        },
        $set: { status: "processing" },
      },
      { upsert: true, new: true }
    );

    try {
      if (jobRecord) {
        jobRecord.status = "processing";
        jobRecord.attempts = job.attemptsMade + 1;
        await jobRecord.save();
      }

      // ─── Derive meeting duration from events ───────────────────────────
      const meetingDuration = await getMeetingDuration(sessionId);

      // ─── Option A: real VideoSDK recording → Whisper ──────────────────
      let segments: TranscriptSegment[] = [];
      let isPartial = false;

      const recordingUrl = await fetchRecordingUrl(session.roomId);

      if (recordingUrl) {
        // Store recordingId on session (Layer 6 requirement)
        session.recordingId = recordingUrl;
        await session.save();

        const result = await transcribeWithGemini();

        if (result) {
          segments = result.segments;
          isPartial = result.isPartial;
        }
      }

      // ─── Empty transcript guard ────────────────────────────────────────
      // ✅ Fixed: check BEFORE saving so we don't write a "completed"
      // transcript with 0 segments then immediately fail.
      if (!segments.length) {
        transcript.status = "failed";
        transcript.metadata = {
          totalDuration: meetingDuration,
          speakerCount: 0,
          wordCount: 0,
          processedAt: new Date().toISOString(),
        };
        await transcript.save();

        session.status = "FAILED";
        session.failureReason = recordingUrl
          ? "Whisper returned empty transcript"
          : "No recording found for session";
        await session.save();

        if (jobRecord) {
          jobRecord.status = "failed";
          jobRecord.lastError = session.failureReason ?? "";
          await jobRecord.save();
        }
        return; // do NOT throw — no point retrying if there is no recording
      }

      // ─── Compute metadata ──────────────────────────────────────────────
      const uniqueSpeakers = new Set(segments.map((s) => s.speaker.participantId));
      const wordCount = segments.reduce(
        (acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length,
        0
      );

      transcript.set("segments", segments);
      transcript.metadata = {
        totalDuration: meetingDuration || (segments.at(-1)?.endTime ?? 0),
        speakerCount: uniqueSpeakers.size,
        wordCount,
        processedAt: new Date().toISOString(),
      };
      // ✅ Partial transcript: store what we have, mark status accordingly
      transcript.status = isPartial ? "partial" : "completed";
      await transcript.save();

      // ─── Enqueue AI scoring ────────────────────────────────────────────
      await PipelineJob.create({
        sessionId,
        organizationId,
        jobType: "ai.scoring",
      });

      await aiQueue.add(
        "ai.scoring",
        { sessionId, organizationId },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: true,
          removeOnFail: false,
        }
      );

      if (jobRecord) {
        jobRecord.status = "completed";
        await jobRecord.save();
      }

      console.log(
        `✅ Transcription complete: ${segments.length} segments, ` +
        `${wordCount} words, partial=${isPartial}`
      );

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("❌ Transcription worker error:", message);

      transcript.status = "failed";
      await transcript.save();

      if (jobRecord) {
        jobRecord.lastError = message;
        jobRecord.status = job.attemptsMade + 1 >= 3 ? "dead_letter" : "failed";
        await jobRecord.save();
      }

      throw err; // let BullMQ handle retry
    }
  },
  { connection }
);