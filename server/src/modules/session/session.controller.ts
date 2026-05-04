import { Request, Response } from "express";
import mongoose from "mongoose";
import { Session } from "./session.model";
import { createSessionService } from "./session.service";
import { generateVideoToken } from "../../utils/generateVideoSDKToken";

const validTransitions: Record<string, string[]> = {
  CREATED: ["LIVE", "EXPIRED"],
  LIVE: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["COMPLETED", "FAILED"],
  FAILED: ["PROCESSING"],
};

// CREATE SESSION
export const createSession = async (req: Request, res: Response) => {
  try {
    const session = await createSessionService(req.body);

    const interviewerParticipants = (session.expectedParticipants || [])
      .filter(
        (p) =>
          p.role === "interviewer" &&
          typeof p.userId === "string" &&
          p.userId.length > 0
      );


    const tokens = {
      candidate: generateVideoToken(session.roomId, "candidate", session.candidateId),
      interviewers: interviewerParticipants.map((p) =>
        generateVideoToken(session.roomId, "interviewer", p.userId as string)
      ),
      observer: generateVideoToken(session.roomId, "observer", "observer")
    };

    res.json({
      sessionId: session._id,
      roomId: session.roomId,
      tokens
    });

  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

// GET SESSION BY ID
export const getSessionById = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    // ✅ FIX: validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Invalid sessionId format" });
    }

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    res.json({
      sessionId: session._id,
      roomId: session.roomId,
      status: session.status,
      organizationId: session.organizationId,
      participants: session.expectedParticipants,
      transcript: session.transcript,
      report: session.report,
      createdAt: session.createdAt
    });

  } catch (error) {
    res.status(500).json({ message: "Failed to fetch session" });
  }
};

// UPDATE STATUS (STATE MACHINE)
// const validTransitions: any = {
//   CREATED: ["LIVE", "EXPIRED"],
//   LIVE: ["PROCESSING", "CANCELLED"],
//   PROCESSING: ["COMPLETED", "FAILED"],
//   FAILED: ["PROCESSING"]
// };

export const updateStatus = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Invalid sessionId format" });
    }

    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: "Not found" });

    if (!validTransitions[session.status]?.includes(status)) {
      return res.status(400).json({ message: "Invalid transition" });
    }

    const prev = session.status;
    session.status = status;
    await session.save();

    res.json({
      sessionId: session._id,
      previousStatus: prev,
      currentStatus: status,
      updatedAt: session.updatedAt
    });

  } catch {
    res.status(500).json({ message: "Failed to update status" });
  }
};

// TOKEN REFRESH
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { role, participantId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Invalid sessionId format" });
    }

    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: "Not found" });

    const token = generateVideoToken(session.roomId, role, participantId);

    res.json({
      token,
      expiresAt: Date.now() + 3600000
    });

  } catch {
    res.status(500).json({ message: "Token refresh failed" });
  }
};

// 🔥 PAGINATION API (NEW)
export const getSessions = async (req: Request, res: Response) => {
  try {
    const { organizationId, status, page = 1, limit = 10 } = req.query;

    if (!organizationId || typeof organizationId !== "string") {
      return res.status(400).json({ message: "organizationId is required" });
    }

    const query: Record<string, string> = { organizationId };

    if (status && typeof status === "string") query.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const sessions = await Session.find(query)
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    const total = await Session.countDocuments(query);

    res.json({
      sessions,
      total,
      page: Number(page),
      limit: Number(limit)
    });

  } catch {
    res.status(500).json({ message: "Failed to fetch sessions" });
  }
};