import axios from "axios";
import { Session } from "./session.model";
import { generateApiToken } from "../../utils/generateVideoSDKToken";

// Validate that a roomId actually exists on VideoSDK's servers.
async function isRoomValid(roomId: string): Promise<boolean> {
  try {
    const token = generateApiToken();
    const res = await axios.get(
      `https://api.videosdk.live/v2/rooms/validate/${roomId}`,
      { headers: { Authorization: token } }
    );
    return res.status === 200;
  } catch {
    return false;
  }
}

// Create a fresh room on VideoSDK and return its roomId.
async function createRoom(): Promise<string> {
  const token = generateApiToken();
  const res = await axios.post(
    "https://api.videosdk.live/v2/rooms",
    {},
    { headers: { Authorization: token } }
  );
  const roomId = res.data.roomId;
  if (!roomId) {
    throw new Error(`VideoSDK room creation failed: ${JSON.stringify(res.data)}`);
  }

  return roomId;
}

interface CompetencyRubricInput {
  name: string;
  weight: number;
  criteria: string;
}
 
interface JobContextInput {
  title: string;
  requiredSkills: string[];
  performanceSkills: string[];
  experienceLevel: string;
}
 
interface ParticipantInput {
  userId: string;
  role: "candidate" | "interviewer";
  name: string;
}

interface CreateSessionInput {
  jobId: string;
  candidateId: string;
  interviewerIds: string[];
  organizationId: string;
  jobContext?: JobContextInput;
  competencyRubric?: CompetencyRubricInput[];
  expectedParticipants?: ParticipantInput[];
}

export const createSessionService = async (data: CreateSessionInput) => {
  const { jobId, candidateId, interviewerIds, organizationId, jobContext, competencyRubric, } = data;

  // Block duplicate live sessions
  const active = await Session.findOne({
    candidateId,
    organizationId,
    status: "LIVE",
  });
  if (active) {
    throw new Error("Candidate already has active session");
  }

  // Reuse an existing CREATED/LIVE session — but validate the room first
  const existing = await Session.findOne({
    jobId,
    candidateId,
    organizationId,
    status: { $in: ["CREATED", "LIVE"] },
  });

  if (existing) {
    // ✅ The root cause of all the 401s: sessions created before the
    // crawler-token fix have roomIds that were never properly registered
    // on VideoSDK's servers. Validate before returning — if the room is
    // gone, reprovision a new one and update the DB record in-place.
    const valid = await isRoomValid(existing.roomId);

    if (!valid) {
      console.warn(
        `[session.service] roomId "${existing.roomId}" invalid on VideoSDK — reprovisioning`
      );
      existing.roomId = await createRoom();
      await existing.save();
    }

    return existing;
  }

  // Fresh session
  const roomId = await createRoom();

  const session = await Session.create({
    organizationId,
    jobId,
    candidateId,
    roomId,
    expectedParticipants:
    data.expectedParticipants ??
    [
      { userId: candidateId, role: "candidate", name: "Candidate" },
      ...interviewerIds.map((id: string) => ({
        userId: id,
        role: "interviewer",
        name: "Interviewer",
      })),
    ],
    jobContext: jobContext ?? {
      title: "Software Engineer",
      requiredSkills: [],
      performanceSkills: [],
      experienceLevel: "mid-level",
    },
    competencyRubric: competencyRubric ?? [],
  });

  return session;
};