import jwt from "jsonwebtoken";
import { ENV } from "../config/env";

export const generateVideoToken = (
  roomId: string,
  role: "candidate" | "interviewer" | "observer",
  participantId: string
) => {
  const permissionsMap = {
    interviewer: ["allow_join", "allow_mod"],
    candidate: ["allow_join", "allow_mod"],
    observer: ["allow_join"],
  };

  return jwt.sign(
    {
      apikey: ENV.VIDEOSDK_API_KEY,
      permissions: permissionsMap[role],
      version: 2,
      roles: ["rtc"],
      roomId,
      participantId,
    },
    ENV.VIDEOSDK_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "2h",
    }
  );
};

export const generateApiToken = () => {
  return jwt.sign(
    {
      apikey: ENV.VIDEOSDK_API_KEY,
      permissions: ["allow_join", "allow_mod"],
      version: 2,
      roles: ["crawler"], 
    },
    ENV.VIDEOSDK_SECRET,
    { algorithm: "HS256", expiresIn: "1h" }
  );
};

export const debugTokenConfig = () => {
  console.log("KEY:", ENV.VIDEOSDK_API_KEY);
  console.log("SECRET length:", ENV.VIDEOSDK_SECRET?.length ?? "UNDEFINED ❌");
  console.log("SECRET first 4 chars:", ENV.VIDEOSDK_SECRET?.slice(0, 4));
};