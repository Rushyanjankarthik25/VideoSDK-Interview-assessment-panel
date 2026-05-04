import { Request, Response } from "express";
import { generateVideoToken } from "../../utils/generateVideoSDKToken";

export const getVideoToken = (req: Request, res: Response) => {
  try {
    const { roomId, role = "candidate", participantId } = req.query;

    if (!roomId || typeof roomId !== "string") {
      return res.status(400).json({ message: "roomId is required" });
    }
    
    // ✅ Delegate to the shared utility so algorithm: "HS256" and
    // roles: ["rtc"] are always present — no risk of divergence.
    if (!participantId || typeof participantId !== "string") {
      return res.status(400).json({
        message: "participantId is required",
      });
    }

    const resolvedParticipantId = participantId;

    const resolvedRole =
      role === "interviewer" || role === "observer"
        ? (role as "interviewer" | "observer")
        : "candidate";

    const token = generateVideoToken(roomId, resolvedRole, resolvedParticipantId);

    res.json({ token });
  } catch (err) {
    console.error("TOKEN ERROR:", err);
    res.status(500).json({ message: "Token generation failed" });
  }
};