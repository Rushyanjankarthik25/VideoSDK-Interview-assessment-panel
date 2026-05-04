import { SessionDoc } from "../modules/session/session.model";
import { EventDoc } from "../modules/event/event.model";
import { eventQueue } from "../queues/event.queue";
import { PipelineJob } from "../modules/pipeline/pipeline.model";
import { transcriptionQueue } from "../queues";

export const handleParticipantJoined = async (session: SessionDoc, event: EventDoc) => {
  const { participantId, role } = event.payload;

  const exists = session.actualParticipants.find(
    (p) => p.userId === participantId
  );

  if (!exists) {
    session.actualParticipants.push({
      userId: participantId,
      role,
      joinedAt: new Date(),
    });
  }

  await session.save();

  const expectedIds = new Set(session.expectedParticipants.map((p) => p.userId));
  const actualIds = new Set(session.actualParticipants.map((p) => p.userId));
  const allPresent = [...expectedIds].every((id) => actualIds.has(id));
 
  if (allPresent) {
    await eventQueue.add("session-ready", {
      sessionId: session._id,
      organizationId: session.organizationId,
    });
  }
};

export const handleMeetingStarted = async (session: SessionDoc) => {
  if (session.status === "LIVE") return;

  session.status = "LIVE";
  await session.save();
};

export const handleMeetingEnded = async (session: SessionDoc) => {
  if (session.status !== "LIVE") return;

  session.status = "PROCESSING";
  await session.save();

  // ✅ create pipeline job
  await PipelineJob.create({
    sessionId: session._id,
    organizationId: session.organizationId,
    jobType: "transcription.process",
  });

  // ✅ enqueue transcription job
  await transcriptionQueue.add("transcription.process", {
    sessionId: session._id,
    organizationId: session.organizationId,
  },
  {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000, // 1s → 4s → 16s
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
};

export const handleSpeakerChanged = async (session: SessionDoc, event: EventDoc) => {
  const { participantId } = event.payload;

  const participant = session.actualParticipants.find(
    (p) => p.userId === participantId
  ) as { userId: string; role: string; joinedAt?: Date; leftAt?: Date; speakCount?: number; lastSpoke?: Date } | undefined;

  if (participant) {
    participant.speakCount = (participant.speakCount ?? 0) + 1;
    participant.lastSpoke = new Date();
    await session.save();
  }
};